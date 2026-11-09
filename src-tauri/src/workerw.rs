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

            // 1. Break parent/owner linkage so the window is completely unowned.
            // An owned window cannot sink below its owner in the Win32 Z-order.
            // Breaking ownership allows the window to freely sit at HWND_BOTTOM (desktop wallpaper layer).
            SetWindowLongPtrW(target, GWLP_HWNDPARENT, 0);

            // 2. Add WS_EX_TOOLWINDOW to hide from Alt+Tab and taskbar without needing an owner.
            // Add WS_EX_NOACTIVATE to prevent the window from stealing focus when clicked.
            // Clear WS_EX_APPWINDOW to ensure it does not appear on the taskbar.
            let ex_style = GetWindowLongPtrW(target, GWL_EXSTYLE);
            let new_style = (ex_style as u32 | WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0) & !WS_EX_APPWINDOW.0;
            SetWindowLongPtrW(target, GWL_EXSTYLE, new_style as isize);

            // 3. Push to bottom of Z-order (behind all applications, directly above desktop)
            SetWindowPos(
                target,
                HWND_BOTTOM,
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            ).map_err(|e| format!("SetWindowPos failed: {e}"))?;
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
    // Validate bounds: prevent integer overflow or offscreen coordinate corruption
    if dx.abs() > 4000 || dy.abs() > 4000 {
        return Err("Move delta exceeds allowable display boundaries (-4000..4000)".to_string());
    }

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

/// Spawns a dedicated background thread that actively enforces HWND_BOTTOM
/// for the desktop widget and sticky overlay whenever any application
/// (such as Endfield, browsers, or games) gains focus or changes Z-order.
/// Also continuously monitors display hardware topology (connecting/disconnecting
/// secondary monitors) to auto-resize the sticky-overlay across all monitors
/// and emit `w://monitors-changed` for dynamic window restoration.
pub fn start_desktop_zorder_guard(app: tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, SetWindowPos, GetSystemMetrics,
            HWND_BOTTOM, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE, SWP_NOZORDER,
            SM_CMONITORS, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
        };
        use std::sync::atomic::Ordering;
        use std::time::Duration;
        use tauri::Emitter;

        std::thread::spawn(move || {
            let mut last_mon_count = unsafe { GetSystemMetrics(SM_CMONITORS) };
            let mut last_virt_screen = unsafe {
                (
                    GetSystemMetrics(SM_XVIRTUALSCREEN),
                    GetSystemMetrics(SM_YVIRTUALSCREEN),
                    GetSystemMetrics(SM_CXVIRTUALSCREEN),
                    GetSystemMetrics(SM_CYVIRTUALSCREEN),
                )
            };

            loop {
                std::thread::sleep(Duration::from_millis(500));

                // ── 1. Monitor & Display Topology Detection ──────────────────────────
                let mon_count = unsafe { GetSystemMetrics(SM_CMONITORS) };
                let vx = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
                let vy = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
                let vcx = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) };
                let vcy = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) };

                if mon_count != last_mon_count || (vx, vy, vcx, vcy) != last_virt_screen {
                    last_mon_count = mon_count;
                    last_virt_screen = (vx, vy, vcx, vcy);

                    // Resize sticky-overlay to cover the new virtual desktop spanning all monitors
                    if let Some(sticky_win) = app.get_webview_window("sticky-overlay") {
                        if let Ok(shwnd) = sticky_win.hwnd() {
                            unsafe {
                                let _ = SetWindowPos(
                                    HWND(shwnd.0 as *mut _),
                                    HWND(0 as *mut _),
                                    vx, vy, vcx, vcy,
                                    SWP_NOZORDER | SWP_NOACTIVATE,
                                );
                            }
                        }
                    }

                    // Emit event to all windows (widget, main, sticky-canvas)
                    let _ = app.emit("w://monitors-changed", serde_json::json!({
                        "monitorCount": mon_count,
                        "virtualScreen": { "x": vx, "y": vy, "width": vcx, "height": vcy }
                    }));
                }

                // ── 2. Skip Z-order defense during active drag ────────────────────────
                let now = crate::now_ms();
                let last_move = crate::LAST_MOVE_EVENT_MS.load(Ordering::Relaxed);
                if now.saturating_sub(last_move) < 600 {
                    continue;
                }

                // ── 3. Query active foreground window ─────────────────────────────────
                let fg = unsafe { GetForegroundWindow() };
                if fg.0.is_null() {
                    continue;
                }

                // ── 4. Resolve widget and sticky overlay handles ──────────────────────
                let widget_hwnd = app.get_webview_window("widget").and_then(|w| w.hwnd().ok());
                let sticky_hwnd = app.get_webview_window("sticky-overlay").and_then(|w| w.hwnd().ok());

                let is_fg_widget = widget_hwnd.map(|h| h.0 as isize == fg.0 as isize).unwrap_or(false);
                let is_fg_sticky = sticky_hwnd.map(|h| h.0 as isize == fg.0 as isize).unwrap_or(false);

                // If foreground window is not the widget itself, ensure widget and sticky are at HWND_BOTTOM
                if !is_fg_widget && !is_fg_sticky {
                    if let Some(h) = widget_hwnd {
                        unsafe {
                            let _ = SetWindowPos(
                                HWND(h.0 as *mut _),
                                HWND_BOTTOM,
                                0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                            );
                        }
                    }

                    if let Some(h) = sticky_hwnd {
                        unsafe {
                            let _ = SetWindowPos(
                                HWND(h.0 as *mut _),
                                HWND_BOTTOM,
                                0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                            );
                        }
                    }
                }
            }
        });
    }
}

