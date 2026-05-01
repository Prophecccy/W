// Lockdown Mode — OS-level app monitor for Windows.
//
// ARCHITECTURE:
// - A background thread polls GetForegroundWindow() every 2 seconds
// - Reads the active window's title via GetWindowTextW()
// - Compares against a user-provided blocklist (case-insensitive substring match)
// - When a match is found, emits a `lockdown-violation` event to the webview
// - 30-second cooldown per unique app to prevent strike-spam
//
// COMMANDS:
// - start_lockdown(blocklist)   → spawns polling thread
// - stop_lockdown()             → kills polling thread
// - update_lockdown_blocklist() → hot-swap blocklist without restart

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use std::collections::HashMap;

use serde::Serialize;
use tauri::Emitter;

// ─── Shared State ────────────────────────────────────────────────

/// Controls the polling thread lifecycle
static LOCKDOWN_RUNNING: AtomicBool = AtomicBool::new(false);

/// The blocklist of window title substrings (lowercase for case-insensitive matching)
static BLOCKLIST: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Cooldown tracker: maps matched app name → last violation instant
/// 30-second cooldown per unique match to prevent strike-spam
static COOLDOWNS: Mutex<Option<HashMap<String, Instant>>> = Mutex::new(None);

const COOLDOWN_SECS: u64 = 30;

// ─── Event payload ───────────────────────────────────────────────

#[derive(Clone, Serialize)]
pub struct ViolationPayload {
    pub app_title: String,
    pub matched_rule: String,
}

// ─── Windows implementation ──────────────────────────────────────

#[cfg(target_os = "windows")]
mod platform {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW,
    };

    /// Gets the title of the currently focused window.
    /// Returns None if no window is focused or the title is empty.
    pub fn get_foreground_title() -> Option<String> {
        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }

            let mut buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, &mut buf);
            if len == 0 {
                return None;
            }

            let title = String::from_utf16_lossy(&buf[..len as usize]);
            if title.is_empty() {
                None
            } else {
                Some(title)
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn get_foreground_title() -> Option<String> {
        None
    }
}

// ─── Polling thread ──────────────────────────────────────────────

fn start_polling(app_handle: tauri::AppHandle) {
    LOCKDOWN_RUNNING.store(true, Ordering::SeqCst);

    // Initialize cooldown map
    if let Ok(mut guard) = COOLDOWNS.lock() {
        *guard = Some(HashMap::new());
    }

    thread::spawn(move || {
        while LOCKDOWN_RUNNING.load(Ordering::SeqCst) {
            if let Some(title) = platform::get_foreground_title() {
                let title_lower = title.to_lowercase();

                // Check against blocklist
                let matched_rule = {
                    if let Ok(guard) = BLOCKLIST.lock() {
                        guard.iter().find(|rule| {
                            title_lower.contains(rule.as_str())
                        }).cloned()
                    } else {
                        None
                    }
                };

                if let Some(rule) = matched_rule {
                    // Check cooldown — only fire if 30s+ since last violation for this app
                    let should_fire = {
                        if let Ok(mut guard) = COOLDOWNS.lock() {
                            if let Some(ref mut map) = *guard {
                                let now = Instant::now();
                                let key = rule.clone();
                                if let Some(last) = map.get(&key) {
                                    if now.duration_since(*last).as_secs() >= COOLDOWN_SECS {
                                        map.insert(key, now);
                                        true
                                    } else {
                                        false
                                    }
                                } else {
                                    map.insert(key, now);
                                    true
                                }
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    };

                    if should_fire {
                        let payload = ViolationPayload {
                            app_title: title,
                            matched_rule: rule,
                        };
                        let _ = app_handle.emit("lockdown-violation", payload);
                    }
                }
            }

            // Poll every 2 seconds — lightweight, single Win32 call
            thread::sleep(Duration::from_secs(2));
        }
    });
}

fn stop_polling() {
    LOCKDOWN_RUNNING.store(false, Ordering::SeqCst);
    // Clear cooldowns
    if let Ok(mut guard) = COOLDOWNS.lock() {
        *guard = None;
    }
    thread::sleep(Duration::from_millis(100));
}

// ─── Tauri Commands ──────────────────────────────────────────────

/// Start lockdown with app handle for event emission.
#[tauri::command]
pub fn start_lockdown_monitor(app: tauri::AppHandle, blocklist: Vec<String>) -> Result<(), String> {
    // Stop any existing session first
    if LOCKDOWN_RUNNING.load(Ordering::SeqCst) {
        stop_polling();
    }

    // Store blocklist (lowercase for case-insensitive matching)
    if let Ok(mut guard) = BLOCKLIST.lock() {
        *guard = blocklist.into_iter().map(|s| s.to_lowercase()).collect();
    }

    start_polling(app);
    Ok(())
}

/// Stop lockdown monitoring.
#[tauri::command]
pub fn stop_lockdown_monitor() -> Result<(), String> {
    stop_polling();
    Ok(())
}

/// Update the blocklist without restarting the polling thread.
#[tauri::command]
pub fn update_lockdown_blocklist(blocklist: Vec<String>) -> Result<(), String> {
    if let Ok(mut guard) = BLOCKLIST.lock() {
        *guard = blocklist.into_iter().map(|s| s.to_lowercase()).collect();
    }
    Ok(())
}
