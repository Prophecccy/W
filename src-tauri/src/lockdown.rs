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
static TAB_CLOSE_SUPPRESSION_UNTIL: Mutex<Option<std::time::Instant>> = Mutex::new(None);
static POLLING_THREAD: Mutex<Option<thread::JoinHandle<()>>> = Mutex::new(None);

// ─── Event payloads ──────────────────────────────────────────────

#[derive(Clone, Serialize)]
pub struct BlockPayload {
    pub app_title: String,
    pub matched_rule: String,
    pub pid: u32,
    pub hwnd: isize,
    pub is_browser: bool,
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
        pub hwnd: isize,
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
                    hwnd: hwnd.0 as isize,
                    x,
                    y,
                    width,
                    height,
                })
            }
        }
    }

    pub fn get_exe_name_by_pid(pid: u32) -> Option<String> {
        unsafe {
            if pid == 0 {
                return None;
            }
            if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                let mut exe_buf = [0u16; MAX_PATH as usize];
                let mut exe_len = MAX_PATH;
                let mut exe_name = String::new();
                if QueryFullProcessImageNameW(
                    handle,
                    PROCESS_NAME_WIN32,
                    PWSTR(exe_buf.as_mut_ptr()),
                    &mut exe_len,
                )
                .is_ok()
                {
                    let full_path = String::from_utf16_lossy(&exe_buf[..exe_len as usize]);
                    if let Some(idx) = full_path.rfind('\\') {
                        exe_name = full_path[idx + 1..].to_string();
                    } else {
                        exe_name = full_path;
                    }
                }
                let _ = CloseHandle(handle);
                if !exe_name.is_empty() {
                    return Some(exe_name);
                }
            }
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub struct ForegroundInfo {
        pub exe_name: String,
        pub title: String,
        pub pid: u32,
        pub hwnd: isize,
        pub x: i32,
        pub y: i32,
        pub width: i32,
        pub height: i32,
    }

    pub fn get_foreground_info() -> Option<ForegroundInfo> {
        None
    }

    pub fn get_exe_name_by_pid(_pid: u32) -> Option<String> {
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

/// Returns true if the executable name matches any known web browser.
pub fn is_browser_process(exe_name: &str) -> bool {
    let lower = exe_name.to_lowercase();
    matches!(
        lower.as_str(),
        "chrome.exe"
            | "msedge.exe"
            | "opera.exe"
            | "operagx.exe"
            | "brave.exe"
            | "firefox.exe"
            | "vivaldi.exe"
            | "arc.exe"
            | "zen.exe"
            | "waterfox.exe"
            | "librewolf.exe"
            | "floorp.exe"
            | "tor.exe"
            | "chromium.exe"
            | "yandex.exe"
            | "safari.exe"
            | "sidekick.exe"
            | "whale.exe"
            | "maxthon.exe"
            | "thorium.exe"
    )
}

// ─── Polling thread ──────────────────────────────────────────────

fn start_polling(app_handle: tauri::AppHandle) -> Result<(), String> {
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

    let handle = thread::Builder::new()
        .name("lockdown-polling".to_string())
        .spawn(move || {
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

                // Check if we are in tab-close suppression window
                let in_tab_suppression = {
                    if let Ok(guard) = TAB_CLOSE_SUPPRESSION_UNTIL.lock() {
                        if let Some(until) = *guard {
                            std::time::Instant::now() < until
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                };

                if in_tab_suppression {
                    if currently_blocking.is_some() {
                        eprintln!("[lockdown] Tab close suppression active — lifting block overlay");
                        currently_blocking = None;
                        let _ = app_handle.emit("lockdown-unblock", UnblockPayload {});
                    }
                    thread::sleep(Duration::from_millis(150));
                    continue;
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
                        let is_browser = is_browser_process(&info.exe_name) && !rule.ends_with(".exe");
                        let display_name = if rule.ends_with(".exe") {
                            info.exe_name.clone()
                        } else {
                            info.title.clone()
                        };

                        if currently_blocking.as_ref() != Some(&rule) {
                            eprintln!(
                                "[lockdown] BLOCK: \"{}\" matched rule \"{}\" (is_browser={})",
                                display_name, rule, is_browser
                            );
                        }

                        currently_blocking = Some(rule.clone());

                        let payload = BlockPayload {
                            app_title: display_name,
                            matched_rule: rule,
                            pid: info.pid,
                            hwnd: info.hwnd,
                            is_browser,
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
        })
        .map_err(|e| format!("Failed to spawn polling thread: {}", e))?;

    if let Ok(mut guard) = POLLING_THREAD.lock() {
        *guard = Some(handle);
    }
    Ok(())
}

fn stop_polling() {
    LOCKDOWN_RUNNING.store(false, Ordering::SeqCst);
    POLLING_GENERATION.fetch_add(1, Ordering::SeqCst);
    
    let handle = {
        if let Ok(mut guard) = POLLING_THREAD.lock() {
            guard.take()
        } else {
            None
        }
    };

    if let Some(h) = handle {
        eprintln!("[lockdown] Waiting for polling thread to exit...");
        let _ = h.join();
        eprintln!("[lockdown] Polling thread joined successfully");
    } else {
        eprintln!("[lockdown] No polling thread to join");
    }
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

    let mut guard = BLOCKLIST.lock().map_err(|_| "BLOCKLIST mutex is poisoned".to_string())?;
    *guard = blocklist.into_iter().map(|s| s.to_lowercase()).collect();
    drop(guard);

    let mut pids = BLOCKED_PIDS.lock().map_err(|_| "BLOCKED_PIDS mutex is poisoned".to_string())?;
    pids.clear();
    drop(pids);

    let mut end_guard = END_TIME.lock().map_err(|_| "END_TIME mutex is poisoned".to_string())?;
    if let Some(secs) = remaining_secs {
        *end_guard = Some(std::time::Instant::now() + std::time::Duration::from_secs(secs));
    } else {
        *end_guard = None;
    }
    drop(end_guard);

    start_polling(app)?;
    Ok(())
}

#[tauri::command]
pub fn stop_lockdown_monitor() -> Result<(), String> {
    eprintln!("[lockdown] stop_lockdown_monitor called");
    let mut end_guard = END_TIME.lock().map_err(|_| "END_TIME mutex is poisoned".to_string())?;
    *end_guard = None;
    drop(end_guard);

    let mut pids = BLOCKED_PIDS.lock().map_err(|_| "BLOCKED_PIDS mutex is poisoned".to_string())?;
    pids.clear();
    drop(pids);

    stop_polling();
    Ok(())
}

#[tauri::command]
pub fn update_lockdown_blocklist(blocklist: Vec<String>) -> Result<(), String> {
    eprintln!(
        "[lockdown] update_lockdown_blocklist called with {} items",
        blocklist.len()
    );

    // Defense: limit total rules, limit rule string length, strip control characters,
    // and explicitly reject rules targeting the app's own process to prevent self-lockout attacks.
    const MAX_RULES: usize = 500;
    const MAX_RULE_LEN: usize = 128;

    let sanitized: Vec<String> = blocklist
        .into_iter()
        .take(MAX_RULES)
        .filter_map(|s| {
            let trimmed = s.trim().to_lowercase();
            if trimmed.is_empty() || trimmed.len() > MAX_RULE_LEN {
                return None;
            }
            // Strip any control characters
            let clean: String = trimmed.chars().filter(|c| !c.is_control()).collect();
            if clean.is_empty() {
                return None;
            }
            // Self-lockout safeguard: never block own executables or window titles
            if clean == "w" || clean == "w.exe" || clean == "w-app" || clean == "w-app.exe"
                || clean == "w_hidden_owner" || clean.contains("antigravity")
            {
                return None;
            }
            Some(clean)
        })
        .collect();

    let mut guard = BLOCKLIST.lock().map_err(|_| "BLOCKLIST mutex is poisoned".to_string())?;
    *guard = sanitized;
    Ok(())
}

#[tauri::command]
pub fn update_lockdown_remaining(remaining_secs: Option<u64>) -> Result<(), String> {
    eprintln!("[lockdown] update_lockdown_remaining called: {:?}", remaining_secs);
    let mut end_guard = END_TIME.lock().map_err(|_| "END_TIME mutex is poisoned".to_string())?;
    if let Some(secs) = remaining_secs {
        // Enforce maximum lockdown interval to prevent timestamp overflow (max 24 hours)
        let clamped = std::cmp::min(secs, 86_400);
        *end_guard = Some(std::time::Instant::now() + std::time::Duration::from_secs(clamped));
    } else {
        *end_guard = None;
    }
    Ok(())
}

/// Debug command: fires a fake lockdown-block event to test the overlay pipeline.
#[tauri::command]
pub fn test_lockdown_block(app: tauri::AppHandle) -> Result<(), String> {
    eprintln!("[lockdown] test_lockdown_block — firing fake event");
    
    // Safety check: only allow test in debug mode or if lockdown is active
    let active = LOCKDOWN_RUNNING.load(Ordering::SeqCst);
    if !active {
        return Err("Lockdown is not active. Test event ignored.".to_string());
    }

    let payload = BlockPayload {
        app_title: "TEST APP".to_string(),
        matched_rule: "test".to_string(),
        pid: 0,
        hwnd: 0,
        is_browser: false,
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

/// Close only the active tab of a blocked browser window using synthesized Ctrl+W keystroke.
#[tauri::command]
pub fn close_blocked_tab(app: tauri::AppHandle, hwnd: isize, pid: u32) -> Result<(), String> {
    eprintln!("[lockdown] close_blocked_tab called for HWND {:X}, PID {}", hwnd, pid);

    // 1. Immediately activate tab-close suppression for 2.5 seconds to prevent race conditions
    if let Ok(mut guard) = TAB_CLOSE_SUPPRESSION_UNTIL.lock() {
        *guard = Some(std::time::Instant::now() + Duration::from_millis(2500));
    }

    // 2. Hide overlay window immediately and emit lockdown-unblock
    if let Some(overlay) = app.get_webview_window("block-overlay") {
        let _ = overlay.hide();
    }
    let _ = app.emit("lockdown-unblock", UnblockPayload {});

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowThreadProcessId, IsWindow, SetForegroundWindow,
        };
        use windows::Win32::System::Threading::{GetCurrentThreadId, AttachThreadInput};
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
            KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, SetFocus,
        };

        if hwnd == 0 {
            return Err("Invalid window handle (0)".to_string());
        }

        let target_hwnd = HWND(hwnd as *mut _);

        unsafe {
            if !IsWindow(target_hwnd).as_bool() {
                return Err("Target window is no longer valid".to_string());
            }

            // Bring target window to foreground so the keystroke hits the active tab
            let current_tid = GetCurrentThreadId();
            let target_tid = GetWindowThreadProcessId(target_hwnd, None);

            if target_tid != 0 && target_tid != current_tid {
                let _ = AttachThreadInput(current_tid, target_tid, true);
                let _ = SetForegroundWindow(target_hwnd);
                let _ = SetFocus(target_hwnd);
                let _ = AttachThreadInput(current_tid, target_tid, false);
            } else {
                let _ = SetForegroundWindow(target_hwnd);
                let _ = SetFocus(target_hwnd);
            }

            // Small delay to let OS process focus switch
            thread::sleep(Duration::from_millis(50));

            // Synthesize Ctrl + W ('W' virtual key code is 0x57) with spaced events
            let vk_w = VIRTUAL_KEY(0x57);

            let ctrl_down = [INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VK_CONTROL,
                        wScan: 0,
                        dwFlags: KEYBD_EVENT_FLAGS(0),
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            }];

            let w_down = [INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: vk_w,
                        wScan: 0,
                        dwFlags: KEYBD_EVENT_FLAGS(0),
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            }];

            let w_up = [INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: vk_w,
                        wScan: 0,
                        dwFlags: KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            }];

            let ctrl_up = [INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VK_CONTROL,
                        wScan: 0,
                        dwFlags: KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            }];

            SendInput(&ctrl_down, std::mem::size_of::<INPUT>() as i32);
            thread::sleep(Duration::from_millis(20));
            SendInput(&w_down, std::mem::size_of::<INPUT>() as i32);
            thread::sleep(Duration::from_millis(30));
            SendInput(&w_up, std::mem::size_of::<INPUT>() as i32);
            thread::sleep(Duration::from_millis(20));
            SendInput(&ctrl_up, std::mem::size_of::<INPUT>() as i32);

            eprintln!("[lockdown] Dispatched Ctrl+W key sequence to HWND {:X}", hwnd);

            // Wait for window title to transition away from blocked rule (up to 800ms)
            for _ in 0..16 {
                thread::sleep(Duration::from_millis(50));
                if !IsWindow(target_hwnd).as_bool() {
                    break;
                }
                if let Some(info) = platform::get_foreground_info() {
                    let title_lower = info.title.to_lowercase();
                    let still_blocked = if let Ok(guard) = BLOCKLIST.lock() {
                        guard.iter().any(|rule| !rule.ends_with(".exe") && title_lower.contains(rule.as_str()))
                    } else {
                        false
                    };
                    if !still_blocked {
                        eprintln!("[lockdown] Tab closed successfully, new foreground title: \"{}\"", info.title);
                        break;
                    }
                }
            }

            let _ = app.emit("lockdown-unblock", UnblockPayload {});
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Tab closure not supported on this platform".to_string())
    }
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
    let pids = BLOCKED_PIDS.lock().map_err(|_| "BLOCKED_PIDS mutex is poisoned".to_string())?;
    let is_blocked = pids.contains(&pid);
    drop(pids);

    if !is_blocked {
        return Err("PID is not in the blocked list".to_string());
    }

    // Verify process executable name still matches blocklist to prevent PID recycling issues
    if let Some(exe_name) = platform::get_exe_name_by_pid(pid) {
        let exe_lower = exe_name.to_lowercase();

        // Browser safeguard: If this process is a browser, ensure the user explicitly blocked the browser executable
        if is_browser_process(&exe_lower) {
            let blocklist = BLOCKLIST.lock().map_err(|_| "BLOCKLIST mutex is poisoned".to_string())?;
            let has_explicit_exe_rule = blocklist.iter().any(|rule| rule.to_lowercase() == exe_lower);
            if !has_explicit_exe_rule {
                eprintln!(
                    "[lockdown] Refusing to kill browser process {} (PID {}) because only website/tab rule matched",
                    exe_name, pid
                );
                return Err("Cannot terminate entire browser process for website block. Use close_blocked_tab.".to_string());
            }
        }

        let blocklist = BLOCKLIST.lock().map_err(|_| "BLOCKLIST mutex is poisoned".to_string())?;
        
        let matches_rule = blocklist.iter().any(|rule| {
            if rule.ends_with(".exe") {
                exe_lower == *rule
            } else {
                // For window title rules, verify it is still a running app
                true
            }
        });
        
        if !matches_rule {
            return Err("Process executable name does not match the active blocklist rules".to_string());
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Threading::{
            OpenProcess, TerminateProcess, PROCESS_TERMINATE,
        };

        unsafe {
            match OpenProcess(PROCESS_TERMINATE, false, pid) {
                Ok(handle) => {
                    if let Err(e) = TerminateProcess(handle, 1) {
                        let _ = CloseHandle(handle);
                        return Err(format!("TerminateProcess failed: {}", e));
                    }
                    let _ = CloseHandle(handle);
                }
                Err(e) => {
                    let err_code = e.code().0 as u32;
                    // ERROR_INVALID_PARAMETER (87) means process is not running / PID not found.
                    // If the process is not running, we treat it as successfully closed.
                    if err_code != 87 {
                        return Err(format!("OpenProcess failed: {} (code {})", e, err_code));
                    }
                }
            }
        }
        eprintln!("[lockdown] Process {} terminated successfully or already dead", pid);
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err("Process termination not supported on this platform".to_string());
    }

    Ok(())
}

