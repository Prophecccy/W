// WorkerW embedding for Windows desktop widget
// Embeds a Tauri window into the desktop's WorkerW layer so it sits behind all other windows.

#[cfg(target_os = "windows")]
mod platform {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowExW, FindWindowW, GetWindow, SendMessageTimeoutW,
        SetParent, SetWindowLongPtrW, GetWindowLongPtrW,
        GWL_EXSTYLE, GW_HWNDPREV, SMTO_NORMAL,
        WS_EX_TOOLWINDOW, WS_EX_APPWINDOW,
    };
    use windows::core::PCWSTR;
    use std::ptr;

    /// Finds the WorkerW window that sits behind the desktop icons.
    /// Works by sending a special message to Progman to spawn WorkerW,
    /// then iterating all top-level windows to find the correct one.
    pub fn find_workerw() -> Option<HWND> {
        unsafe {
            // Find Progman
            let progman_class: Vec<u16> = "Progman\0".encode_utf16().collect();
            let progman = FindWindowW(PCWSTR(progman_class.as_ptr()), PCWSTR(ptr::null()));
            let progman_hwnd = match progman {
                Ok(hwnd) if hwnd.0 != ptr::null_mut() => hwnd,
                _ => return None,
            };

            // Send 0x052C to spawn WorkerW
            let mut _result = 0usize;
            let _ = SendMessageTimeoutW(
                progman_hwnd,
                0x052C,
                WPARAM(0xD),
                LPARAM(0x1),
                SMTO_NORMAL,
                1000,
                Some(&mut _result as *mut usize),
            );

            // Now enumerate top-level windows to find the right WorkerW
            static mut WORKER_W: Option<HWND> = None;
            WORKER_W = None;

            unsafe extern "system" fn enum_callback(hwnd: HWND, _: LPARAM) -> BOOL {
                let shelldll_class: Vec<u16> = "SHELLDLL_DefView\0".encode_utf16().collect();
                let child = FindWindowExW(hwnd, HWND(ptr::null_mut()), PCWSTR(shelldll_class.as_ptr()), PCWSTR(ptr::null()));
                if let Ok(child_hwnd) = child {
                    if child_hwnd.0 != ptr::null_mut() {
                        // The WorkerW we want is the one AFTER the one containing SHELLDLL_DefView
                        let workerw_class: Vec<u16> = "WorkerW\0".encode_utf16().collect();
                        let next = FindWindowExW(HWND(ptr::null_mut()), hwnd, PCWSTR(workerw_class.as_ptr()), PCWSTR(ptr::null()));
                        if let Ok(next_hwnd) = next {
                            if next_hwnd.0 != ptr::null_mut() {
                                WORKER_W = Some(next_hwnd);
                                return BOOL(0); // stop enumerating
                            }
                        }
                    }
                }
                BOOL(1) // continue
            }

            let _ = EnumWindows(Some(enum_callback), LPARAM(0));
            WORKER_W
        }
    }

    /// Embeds a window handle into the WorkerW layer
    pub fn embed_in_workerw(hwnd: isize) -> Result<(), String> {
        let workerw = find_workerw().ok_or("Could not find WorkerW window")?;
        unsafe {
            let target = HWND(hwnd as *mut _);
            let _ = SetParent(target, workerw);

            // Add WS_EX_TOOLWINDOW to hide from alt-tab and taskbar
            let ex_style = GetWindowLongPtrW(target, GWL_EXSTYLE);
            let new_style = (ex_style as u32 | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0;
            SetWindowLongPtrW(target, GWL_EXSTYLE, new_style as isize);
        }
        Ok(())
    }

    /// Detaches a window from WorkerW (re-parents to desktop)
    pub fn detach_from_workerw(hwnd: isize) -> Result<(), String> {
        unsafe {
            let target = HWND(hwnd as *mut _);
            let _ = SetParent(target, HWND(ptr::null_mut()));

            // Remove WS_EX_TOOLWINDOW
            let ex_style = GetWindowLongPtrW(target, GWL_EXSTYLE);
            let new_style = (ex_style as u32 & !WS_EX_TOOLWINDOW.0) | WS_EX_APPWINDOW.0;
            SetWindowLongPtrW(target, GWL_EXSTYLE, new_style as isize);
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn embed_in_workerw(_hwnd: isize) -> Result<(), String> {
        Err("WorkerW embedding is only supported on Windows".to_string())
    }
    pub fn detach_from_workerw(_hwnd: isize) -> Result<(), String> {
        Err("WorkerW detach is only supported on Windows".to_string())
    }
}

use tauri::Manager;

#[tauri::command]
pub fn embed_widget_in_desktop(app: tauri::AppHandle) -> Result<(), String> {
    let widget_window = app
        .get_webview_window("widget")
        .ok_or("Widget window not found")?;

    // Get the native HWND
    #[cfg(target_os = "windows")]
    {
        use tauri::Emitter;
        let hwnd = widget_window.hwnd().map_err(|e| e.to_string())?;
        platform::embed_in_workerw(hwnd.0 as isize)?;
        let _ = app.emit("widget-embedded", true);
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err("WorkerW is Windows-only".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn detach_widget_from_desktop(app: tauri::AppHandle) -> Result<(), String> {
    let widget_window = app
        .get_webview_window("widget")
        .ok_or("Widget window not found")?;

    #[cfg(target_os = "windows")]
    {
        let hwnd = widget_window.hwnd().map_err(|e| e.to_string())?;
        platform::detach_from_workerw(hwnd.0 as isize)?;
    }

    Ok(())
}

#[tauri::command]
pub fn move_widget(app: tauri::AppHandle, x: i32, y: i32) -> Result<(), String> {
    let widget_window = app
        .get_webview_window("widget")
        .ok_or("Widget window not found")?;

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOSIZE, SWP_NOZORDER, SWP_NOACTIVATE, HWND_TOP};
        let hwnd = widget_window.hwnd().map_err(|e| e.to_string())?;
        unsafe {
            let target = windows::Win32::Foundation::HWND(hwnd.0 as *mut _);
            let _ = SetWindowPos(
                target,
                HWND_TOP,
                x,
                y,
                0,
                0,
                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            );
        }
    }

    Ok(())
}
