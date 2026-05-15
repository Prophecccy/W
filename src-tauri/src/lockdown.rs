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
    use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    };
    use windows::core::PWSTR;

    /// Gets the exe name and title of the currently focused window.
    /// Returns None if no window is focused or both are empty.
    pub fn get_foreground_info() -> Option<(String, String)> {
        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            // HWND wraps a *mut c_void in windows crate 0.58
            if hwnd.0.is_null() {
                return None;
            }

            let mut title_buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, &mut title_buf);
            let title = if len == 0 {
                String::new()
            } else {
                String::from_utf16_lossy(&title_buf[..len as usize])
            };

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            
            let mut exe_name = String::new();
            if pid != 0 {
                if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                    let mut exe_buf = [0u16; MAX_PATH as usize];
                    let mut exe_len = MAX_PATH;
                    if QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(exe_buf.as_mut_ptr()), &mut exe_len).is_ok() {
                        let full_path = String::from_utf16_lossy(&exe_buf[..exe_len as usize]);
                        if let Some(idx) = full_path.rfind('\\') {
                            exe_name = full_path[idx + 1..].to_string();
                        } else {
                            exe_name = full_path;
                        }
                    }
                    let _ = CloseHandle(handle);
                }
            }

            if title.is_empty() && exe_name.is_empty() {
                None
            } else {
                Some((exe_name, title))
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn get_foreground_info() -> Option<(String, String)> {
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

    // Log the current blocklist for diagnostics
    if let Ok(guard) = BLOCKLIST.lock() {
        eprintln!("[lockdown] Polling started with {} rules: {:?}", guard.len(), *guard);
    }

    thread::spawn(move || {
        let mut tick_count: u64 = 0;
        while LOCKDOWN_RUNNING.load(Ordering::SeqCst) {
            tick_count += 1;

            if let Some((exe_name, title)) = platform::get_foreground_info() {
                // Log every 15th tick (~30 seconds) to avoid spam
                if tick_count % 15 == 1 {
                    eprintln!("[lockdown] tick #{} — foreground: [{}] \"{}\"", tick_count, exe_name, title);
                }

                let title_lower = title.to_lowercase();
                let exe_lower = exe_name.to_lowercase();

                // Check against blocklist
                let matched_rule = {
                    if let Ok(guard) = BLOCKLIST.lock() {
                        guard.iter().find(|rule| {
                            // If rule ends in .exe, match exactly against process name
                            if rule.ends_with(".exe") {
                                exe_lower == rule.as_str()
                            } else {
                                // Otherwise, match substring against window title
                                title_lower.contains(rule.as_str())
                            }
                        }).cloned()
                    } else {
                        None
                    }
                };

                if let Some(rule) = matched_rule {
                    let display_name = if rule.ends_with(".exe") { exe_name.clone() } else { title.clone() };
                    eprintln!("[lockdown] MATCH: \"{}\" matched rule \"{}\"", display_name, rule);

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
                                        eprintln!("[lockdown] cooldown active for \"{}\" — skipping", rule);
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
                            app_title: display_name,
                            matched_rule: rule.clone(),
                        };
                        eprintln!("[lockdown] EMITTING lockdown-violation for \"{}\"", rule);
                        match app_handle.emit("lockdown-violation", payload) {
                            Ok(_) => eprintln!("[lockdown] Event emitted successfully"),
                            Err(e) => eprintln!("[lockdown] Event emit FAILED: {}", e),
                        }
                    }
                }
            }

            // Poll every 2 seconds — lightweight, single Win32 call
            thread::sleep(Duration::from_secs(2));
        }
        eprintln!("[lockdown] Polling thread stopped");
    });
}

fn stop_polling() {
    LOCKDOWN_RUNNING.store(false, Ordering::SeqCst);
    // Clear cooldowns
    if let Ok(mut guard) = COOLDOWNS.lock() {
        *guard = None;
    }
    thread::sleep(Duration::from_millis(100));
    eprintln!("[lockdown] Monitor stopped");
}

// ─── Tauri Commands ──────────────────────────────────────────────

/// Start lockdown with app handle for event emission.
#[tauri::command]
pub fn start_lockdown_monitor(app: tauri::AppHandle, blocklist: Vec<String>) -> Result<(), String> {
    eprintln!("[lockdown] start_lockdown_monitor called with {} items: {:?}", blocklist.len(), blocklist);

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
    eprintln!("[lockdown] stop_lockdown_monitor called");
    stop_polling();
    Ok(())
}

/// Update the blocklist without restarting the polling thread.
#[tauri::command]
pub fn update_lockdown_blocklist(blocklist: Vec<String>) -> Result<(), String> {
    eprintln!("[lockdown] update_lockdown_blocklist called with {} items", blocklist.len());
    if let Ok(mut guard) = BLOCKLIST.lock() {
        *guard = blocklist.into_iter().map(|s| s.to_lowercase()).collect();
    }
    Ok(())
}
