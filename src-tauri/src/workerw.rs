// Widget window management for Windows desktop widget
// Uses HWND_BOTTOM z-ordering to keep the widget behind all other windows
// while still being a normal top-level window (fully draggable).

#[cfg(target_os = "windows")]
mod platform {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SetWindowLongPtrW, GetWindowLongPtrW,
        GWL_EXSTYLE, GWLP_HWNDPARENT, SWP_NOSIZE, SWP_NOMOVE, SWP_NOACTIVATE, SWP_NOZORDER,
        WS_EX_TOOLWINDOW, WS_EX_APPWINDOW, WS_EX_NOACTIVATE,
        HWND_BOTTOM,
    };

    /// Pushes a window to the bottom of the Z-order and hides it from Alt+Tab.
    /// The window remains a normal top-level window — fully draggable, clickable.
    pub fn pin_to_bottom(hwnd: isize) -> Result<(), String> {
        unsafe {
            let target = HWND(hwnd as *mut _);

            // Push to bottom of Z-order
            SetWindowPos(
                target,
                HWND_BOTTOM,
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            ).map_err(|e| format!("SetWindowPos failed: {e}"))?;

            // Add WS_EX_TOOLWINDOW to hide from Alt+Tab and taskbar
            // Add WS_EX_NOACTIVATE to prevent the window from taking focus when clicked
            let ex_style = GetWindowLongPtrW(target, GWL_EXSTYLE);
            let new_style = (ex_style as u32 | WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0) & !WS_EX_APPWINDOW.0;
            SetWindowLongPtrW(target, GWL_EXSTYLE, new_style as isize);

            // Break parent/owner linkage so the main window can render over it
            SetWindowLongPtrW(target, GWLP_HWNDPARENT, 0);
        }
        Ok(())
    }

    /// Removes the bottom-pinning and restores normal Alt+Tab visibility.
    pub fn unpin_from_bottom(hwnd: isize) -> Result<(), String> {
        unsafe {
            let target = HWND(hwnd as *mut _);

            // Remove WS_EX_TOOLWINDOW and WS_EX_NOACTIVATE, re-add WS_EX_APPWINDOW
            let ex_style = GetWindowLongPtrW(target, GWL_EXSTYLE);
            let new_style = (ex_style as u32 & !WS_EX_TOOLWINDOW.0 & !WS_EX_NOACTIVATE.0) | WS_EX_APPWINDOW.0;
            SetWindowLongPtrW(target, GWL_EXSTYLE, new_style as isize);
        }
        Ok(())
    }

    /// Moves a window by (dx, dy) pixels using GetWindowRect.
    /// Uses SWP_NOZORDER to preserve whatever z-order the window already has.
    pub fn move_by(hwnd: isize, dx: i32, dy: i32) -> Result<(), String> {
        use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
        use windows::Win32::Foundation::RECT;

        unsafe {
            let target = HWND(hwnd as *mut _);
            let mut rect = RECT::default();
            GetWindowRect(target, &mut rect)
                .map_err(|e| format!("GetWindowRect failed: {e}"))?;

            SetWindowPos(
                target,
                None,
                rect.left + dx,
                rect.top + dy,
                0, 0,
                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            ).map_err(|e| format!("SetWindowPos move failed: {e}"))?;
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn pin_to_bottom(_hwnd: isize) -> Result<(), String> {
        Err("Bottom-pinning is only supported on Windows".to_string())
    }
    pub fn unpin_from_bottom(_hwnd: isize) -> Result<(), String> {
        Err("Unpinning is only supported on Windows".to_string())
    }
    pub fn move_by(_hwnd: isize, _dx: i32, _dy: i32) -> Result<(), String> {
        Err("Window move is only supported on Windows".to_string())
    }
}

use tauri::Manager;

/// Pin the widget to the bottom of the Z-order (behind everything else).
#[tauri::command]
pub fn embed_widget_in_desktop(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(widget_window) = app.get_webview_window("widget") {
            if let Ok(hwnd) = widget_window.hwnd() {
                let _ = platform::pin_to_bottom(hwnd.0 as isize);
            }
        }
        
        if let Some(sticky_window) = app.get_webview_window("sticky-overlay") {
            if let Ok(hwnd) = sticky_window.hwnd() {
                let _ = platform::pin_to_bottom(hwnd.0 as isize);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err("Windows-only feature".to_string());
    }

    Ok(())
}

/// Unpin the widget from the bottom.
#[tauri::command]
pub fn detach_widget_from_desktop(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(widget_window) = app.get_webview_window("widget") {
            if let Ok(hwnd) = widget_window.hwnd() {
                let _ = platform::unpin_from_bottom(hwnd.0 as isize);
            }
        }
        
        if let Some(sticky_window) = app.get_webview_window("sticky-overlay") {
            if let Ok(hwnd) = sticky_window.hwnd() {
                let _ = platform::unpin_from_bottom(hwnd.0 as isize);
            }
        }
    }

    Ok(())
}

/// Re-pin widget to bottom after a drag or focus event.
#[tauri::command]
pub fn pin_widget_bottom(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_NOSIZE, SWP_NOMOVE, SWP_NOACTIVATE, HWND_BOTTOM,
        };
        use windows::Win32::Foundation::HWND;

        if let Some(widget_window) = app.get_webview_window("widget") {
            if let Ok(hwnd) = widget_window.hwnd() {
                unsafe {
                    let target = HWND(hwnd.0 as *mut _);
                    let _ = SetWindowPos(
                        target,
                        HWND_BOTTOM,
                        0, 0, 0, 0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                }
            }
        }
        
        if let Some(sticky_window) = app.get_webview_window("sticky-overlay") {
            if let Ok(hwnd) = sticky_window.hwnd() {
                unsafe {
                    let target = HWND(hwnd.0 as *mut _);
                    let _ = SetWindowPos(
                        target,
                        HWND_BOTTOM,
                        0, 0, 0, 0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                }
            }
        }
    }

    Ok(())
}

/// Move the widget window by (dx, dy) pixels — fully native, no async.
#[tauri::command]
pub fn move_widget_by(app: tauri::AppHandle, dx: i32, dy: i32) -> Result<(), String> {
    let widget_window = app
        .get_webview_window("widget")
        .ok_or("Widget window not found")?;

    #[cfg(target_os = "windows")]
    {
        let hwnd = widget_window.hwnd().map_err(|e| e.to_string())?;
        platform::move_by(hwnd.0 as isize, dx, dy)?;
    }

    Ok(())
}
