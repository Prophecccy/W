// Lockdown Mode — OS-level app blocker for Windows.
//
// ARCHITECTURE:
// - A background thread polls GetForegroundWindow() every 500ms
// - When a restricted app is detected, emits bounding-box coordinates
//   so the React layer can position a block-overlay window on top of it
// - Self-lockout safeguard: our own process windows are NEVER blocked
// - No strikes or notifications — purely a visual/physical block
//
// COMMANDS:
// - start_lockdown_monitor(blocklist)   → spawns polling thread
// - stop_lockdown_monitor()             → kills polling thread
// - update_lockdown_blocklist()         → hot-swap blocklist without restart

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{Emitter, Manager};

// ─── Shared State ────────────────────────────────────────────────

static LOCKDOWN_RUNNING: AtomicBool = AtomicBool::new(false);
static POLLING_GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static BLOCKLIST: Mutex<Vec<String>> = Mutex::new(Vec::new());
static END_TIME: Mutex<Option<std::time::Instant>> = Mutex::new(None);
static BLOCKED_PIDS: Mutex<Vec<u32>> = Mutex::new(Vec::new());

// ─── Event payloads ──────────────────────────────────────────────

#[derive(Clone, Serialize)]
pub struct BlockPayload {
    pub app_title: String,
    pub matched_rule: String,
    pub pid: u32,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Clone, Serialize)]
pub struct UnblockPayload {}

// ─── Windows implementation ──────────────────────────────────────

#[cfg(target_os = "windows")]
mod platform {
    use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH, RECT, WPARAM, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId, GetWindowRect,
        SendMessageTimeoutW, WM_GETTEXT, SMTO_ABORTIFHUNG, SMTO_NORMAL,
    };
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
        PROCESS_NAME_WIN32,
    };
    use windows::core::PWSTR;

    pub struct ForegroundInfo {
        pub exe_name: String,
        pub title: String,
        pub pid: u32,
        pub x: i32,
        pub y: i32,
        pub width: i32,
        pub height: i32,
    }

    pub fn get_foreground_info() -> Option<ForegroundInfo> {
        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }

            // Safe title fetch with 50ms timeout
            let mut title_buf = [0u16; 512];
            let mut result_len: usize = 0;
            let res = SendMessageTimeoutW(
                hwnd,
                WM_GETTEXT,
                WPARAM(title_buf.len()),
                LPARAM(title_buf.as_mut_ptr() as isize),
                SMTO_ABORTIFHUNG | SMTO_NORMAL,
                50,
                Some(&mut result_len),
            );
            let title = if res.0 != 0 && result_len > 0 {
                let len = std::cmp::min(result_len, title_buf.len() - 1);
                String::from_utf16_lossy(&title_buf[..len])
            } else {
                // Fallback to GetWindowTextW
                let mut fallback_buf = [0u16; 512];
                let len = GetWindowTextW(hwnd, &mut fallback_buf);
                if len == 0 {
                    String::new()
                } else {
                    String::from_utf16_lossy(&fallback_buf[..len as usize])
                }
            };

            // Get PID
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));

            // Get exe name
            let mut exe_name = String::new();
            if pid != 0 {
                if let Ok(handle) =
                    OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
                {
                    let mut exe_buf = [0u16; MAX_PATH as usize];
                    let mut exe_len = MAX_PATH;
                    if QueryFullProcessImageNameW(
                        handle,
                        PROCESS_NAME_WIN32,
                        PWSTR(exe_buf.as_mut_ptr()),
                        &mut exe_len,
                    )
                    .is_ok()
                    {
                        let full_path =
                            String::from_utf16_lossy(&exe_buf[..exe_len as usize]);
                        if let Some(idx) = full_path.rfind('\\') {
                            exe_name = full_path[idx + 1..].to_string();
                        } else {
                            exe_name = full_path;
                        }
                    }
                    let _ = CloseHandle(handle);
                }
            }

            // Get window bounding box via DWM extended bounds to ignore drop shadows, fall back to GetWindowRect
            let mut rect = RECT::default();
            let (x, y, width, height) = if DwmGetWindowAttribute(
                hwnd,
                DWMWA_EXTENDED_FRAME_BOUNDS,
                &mut rect as *mut _ as *mut std::ffi::c_void,
                std::mem::size_of::<RECT>() as u32,
            ).is_ok() {
                (
                    rect.left,
                    rect.top,
                    rect.right - rect.left,
                    rect.bottom - rect.top,
                )
            } else if GetWindowRect(hwnd, &mut rect).is_ok() {
                (
                    rect.left,
                    rect.top,
                    rect.right - rect.left,
                    rect.bottom - rect.top,
                )
            } else {
                (0, 0, 800, 600)
            };

            if title.is_empty() && exe_name.is_empty() {
                None
            } else {
                Some(ForegroundInfo {
                    exe_name,
                    title,
                    pid,
                    x,
                    y,
                    width,
                    height,
                })
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub struct ForegroundInfo {
        pub exe_name: String,
        pub title: String,
        pub pid: u32,
        pub x: i32,
        pub y: i32,
        pub width: i32,
        pub height: i32,
    }

    pub fn get_foreground_info() -> Option<ForegroundInfo> {
        None
    }
}

// ─── Self-lockout safeguard (UNBREAKABLE) ────────────────────────
// The app must NEVER be able to lock itself down.

fn is_own_window(info: &platform::ForegroundInfo) -> bool {
    // Primary check: compare process IDs
    let own_pid = std::process::id();
    if info.pid == own_pid {
        return true;
    }

    // Hardcoded failsafe: never block our own executable or window titles
    let exe_lower = info.exe_name.to_lowercase();
    if exe_lower == "w.exe" || exe_lower == "w-app.exe" {
        return true;
    }

    // Dynamic self-exclusion check: check if foreground matches W's currently running executable name
    if let Ok(current_path) = std::env::current_exe() {
        if let Some(file_name) = current_path.file_name() {
            if let Some(file_name_str) = file_name.to_str() {
                if file_name_str.to_lowercase() == exe_lower {
                    return true;
                }
            }
        }
    }

    let title_lower = info.title.to_lowercase();
    if title_lower == "w" || title_lower == "w widget" || title_lower.contains("sticky canvas") {
        return true;
    }
    if title_lower.contains("command center") {
        return true;
    }

    false
}

// ─── Polling thread ──────────────────────────────────────────────

fn start_polling(app_handle: tauri::AppHandle) {
    LOCKDOWN_RUNNING.store(true, Ordering::SeqCst);
    let my_generation = POLLING_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    if let Ok(guard) = BLOCKLIST.lock() {
        eprintln!(
            "[lockdown] Polling started (gen={}) with {} rules: {:?}",
            my_generation,
            guard.len(),
            *guard
        );
    }

    thread::spawn(move || {
        let mut currently_blocking: Option<String> = None;
        let mut tick_count: u64 = 0;

        while LOCKDOWN_RUNNING.load(Ordering::SeqCst) && POLLING_GENERATION.load(Ordering::SeqCst) == my_generation {
            tick_count += 1;

            // Check if timer expired
            let expired = {
                if let Ok(guard) = END_TIME.lock() {
                    if let Some(end) = *guard {
                        std::time::Instant::now() >= end
                    } else {
                        false
                    }
                } else {
                    false
                }
            };

            if expired {
                eprintln!("[lockdown] Timer expired in Rust thread. Hiding overlay and stopping monitor.");
                if let Some(overlay) = app_handle.get_webview_window("block-overlay") {
                    let _ = overlay.hide();
                }
                let _ = app_handle.emit("lockdown-expired", ());
                LOCKDOWN_RUNNING.store(false, Ordering::SeqCst);
                break;
            }

            if let Some(info) = platform::get_foreground_info() {
                // Diagnostic logging every ~10 seconds
                if tick_count % 20 == 1 {
                    eprintln!(
                        "[lockdown] tick #{} — foreground: [{}] \"{}\" (pid={})",
                        tick_count, info.exe_name, info.title, info.pid
                    );
                }

                // ── SELF-LOCKOUT SAFEGUARD ── NEVER block our own windows
                if is_own_window(&info) {
                    thread::sleep(Duration::from_millis(500));
                    continue;
                }

                let title_lower = info.title.to_lowercase();
                let exe_lower = info.exe_name.to_lowercase();

                // Check blocklist
                let matched_rule = {
                    if let Ok(guard) = BLOCKLIST.lock() {
                        guard
                            .iter()
                            .find(|rule| {
                                if rule.ends_with(".exe") {
                                    exe_lower == rule.as_str()
                                } else {
                                    title_lower.contains(rule.as_str())
                                }
                            })
                            .cloned()
                    } else {
                        None
                    }
                };

                if let Some(rule) = matched_rule {
                    let display_name = if rule.ends_with(".exe") {
                        info.exe_name.clone()
                    } else {
                        info.title.clone()
                    };

                    if currently_blocking.as_ref() != Some(&rule) {
                        eprintln!(
                            "[lockdown] BLOCK: \"{}\" matched rule \"{}\"",
                            display_name, rule
                        );
                    }

                    currently_blocking = Some(rule.clone());

                    let payload = BlockPayload {
                        app_title: display_name,
                        matched_rule: rule,
                        pid: info.pid,
                        x: info.x,
                        y: info.y,
                        width: info.width,
                        height: info.height,
                    };

                    if let Ok(mut pids) = BLOCKED_PIDS.lock() {
                        if !pids.contains(&info.pid) {
                            pids.push(info.pid);
                            if pids.len() > 50 {
                                pids.remove(0);
                            }
                        }
                    }

                    let _ = app_handle.emit("lockdown-block", payload);
                } else {
                    // Non-blocked, non-self window has focus
                    if currently_blocking.is_some() {
                        eprintln!("[lockdown] UNBLOCK: blocked app lost focus");
                        currently_blocking = None;
                        let _ = app_handle.emit("lockdown-unblock", UnblockPayload {});
                    }
                }
            }

            // Poll every 500ms for responsive overlay tracking
            thread::sleep(Duration::from_millis(500));
        }

        // Emit unblock when stopping
        if currently_blocking.is_some() {
            let _ = app_handle.emit("lockdown-unblock", UnblockPayload {});
        }
        eprintln!("[lockdown] Polling thread stopped for gen {}", my_generation);
    });
}

fn stop_polling() {
    LOCKDOWN_RUNNING.store(false, Ordering::SeqCst);
    POLLING_GENERATION.fetch_add(1, Ordering::SeqCst);
    thread::sleep(Duration::from_millis(100));
    eprintln!("[lockdown] Monitor stopped");
}

// ─── Tauri Commands ──────────────────────────────────────────────

#[tauri::command]
pub fn start_lockdown_monitor(
    app: tauri::AppHandle,
    blocklist: Vec<String>,
    remaining_secs: Option<u64>,
) -> Result<(), String> {
    eprintln!(
        "[lockdown] start_lockdown_monitor called with {} items (remaining: {:?}s)",
        blocklist.len(),
        remaining_secs
    );

    if LOCKDOWN_RUNNING.load(Ordering::SeqCst) {
        stop_polling();
    }

    if let Ok(mut guard) = BLOCKLIST.lock() {
        *guard = blocklist.into_iter().map(|s| s.to_lowercase()).collect();
    }

    if let Ok(mut pids) = BLOCKED_PIDS.lock() {
        pids.clear();
    }

    if let Ok(mut guard) = END_TIME.lock() {
        if let Some(secs) = remaining_secs {
            *guard = Some(std::time::Instant::now() + std::time::Duration::from_secs(secs));
        } else {
            *guard = None;
        }
    }

    start_polling(app);
    Ok(())
}

#[tauri::command]
pub fn stop_lockdown_monitor() -> Result<(), String> {
    eprintln!("[lockdown] stop_lockdown_monitor called");
    if let Ok(mut guard) = END_TIME.lock() {
        *guard = None;
    }
    if let Ok(mut pids) = BLOCKED_PIDS.lock() {
        pids.clear();
    }
    stop_polling();
    Ok(())
}

#[tauri::command]
pub fn update_lockdown_blocklist(blocklist: Vec<String>) -> Result<(), String> {
    eprintln!(
        "[lockdown] update_lockdown_blocklist called with {} items",
        blocklist.len()
    );
    if let Ok(mut guard) = BLOCKLIST.lock() {
        *guard = blocklist.into_iter().map(|s| s.to_lowercase()).collect();
    }
    Ok(())
}

#[tauri::command]
pub fn update_lockdown_remaining(remaining_secs: Option<u64>) -> Result<(), String> {
    eprintln!("[lockdown] update_lockdown_remaining called: {:?}", remaining_secs);
    if let Ok(mut guard) = END_TIME.lock() {
        if let Some(secs) = remaining_secs {
            *guard = Some(std::time::Instant::now() + std::time::Duration::from_secs(secs));
        } else {
            *guard = None;
        }
    }
    Ok(())
}

/// Debug command: fires a fake lockdown-block event to test the overlay pipeline.
#[tauri::command]
pub fn test_lockdown_block(app: tauri::AppHandle) -> Result<(), String> {
    eprintln!("[lockdown] test_lockdown_block — firing fake event");
    let payload = BlockPayload {
        app_title: "TEST APP".to_string(),
        matched_rule: "test".to_string(),
        pid: 0,
        x: 100,
        y: 100,
        width: 800,
        height: 600,
    };
    app.emit("lockdown-block", payload)
        .map_err(|e| format!("emit failed: {}", e))?;
    eprintln!("[lockdown] test_lockdown_block — event emitted OK");
    Ok(())
}

/// Kill a blocked process by PID. Called when the user clicks "Close" on the overlay.
#[tauri::command]
pub fn kill_blocked_process(pid: u32) -> Result<(), String> {
    eprintln!("[lockdown] kill_blocked_process called for PID {}", pid);

    // Safety: never allow killing our own process
    let own_pid = std::process::id();
    if pid == own_pid || pid == 0 {
        return Err("Cannot kill own process or PID 0".to_string());
    }

    // Validate against BLOCKED_PIDS
    let is_blocked = {
        if let Ok(pids) = BLOCKED_PIDS.lock() {
            pids.contains(&pid)
        } else {
            false
        }
    };

    if !is_blocked {
        return Err("PID is not in the blocked list".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Threading::{
            OpenProcess, TerminateProcess, PROCESS_TERMINATE,
        };

        unsafe {
            let handle = OpenProcess(PROCESS_TERMINATE, false, pid)
                .map_err(|e| format!("OpenProcess failed: {}", e))?;
            TerminateProcess(handle, 1)
                .map_err(|e| format!("TerminateProcess failed: {}", e))?;
            let _ = CloseHandle(handle);
        }
        eprintln!("[lockdown] Process {} terminated successfully", pid);
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err("Process termination not supported on this platform".to_string());
    }

    Ok(())
}

