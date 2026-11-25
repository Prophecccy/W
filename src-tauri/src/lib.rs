// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{
    Manager, Emitter, Position, PhysicalPosition,
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;

mod workerw;
mod sticky_overlay;
mod lockdown;
mod secure_store;
mod security_audit;

static ALLOW_CLOSE: AtomicBool = AtomicBool::new(false);
static HIDDEN_OWNER_HWND: OnceLock<isize> = OnceLock::new();
static APP_MUTEX_HANDLE: OnceLock<isize> = OnceLock::new();

/// Debounce timestamp (epoch millis) for SetWindowPos calls during drag.
/// Prevents hundreds of Win32 calls per second when a window is being moved.
static LAST_BOTTOM_PIN_MS: AtomicU64 = AtomicU64::new(0);

/// Tracks the last Moved event timestamp (always updated, no debounce).
/// Used by the Focused handler to detect if a drag is in progress.
pub static LAST_MOVE_EVENT_MS: AtomicU64 = AtomicU64::new(0);

#[cfg(target_os = "windows")]
pub fn get_hidden_owner() -> isize {
    *HIDDEN_OWNER_HWND.get_or_init(|| {
        use windows::core::w;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, WS_POPUP, WINDOW_EX_STYLE,
        };

        unsafe {
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                w!("STATIC"),
                w!("W_Hidden_Owner"),
                WS_POPUP,
                0, 0, 0, 0,
                HWND(std::ptr::null_mut()),
                None,
                None,
                None
            );
            match hwnd {
                Ok(h) => h.0 as isize,
                Err(_) => 0,
            }
        }
    })
}

/// Returns current time in milliseconds since UNIX epoch.
pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub(crate) fn require_window_label(
    window: &tauri::WebviewWindow,
    allowed: &[&str],
) -> Result<(), String> {
    let label = window.label();
    if allowed.iter().any(|candidate| *candidate == label) {
        Ok(())
    } else {
        security_audit::record(
            Some(window.app_handle()),
            "HIGH",
            "IPC_UNAUTHORIZED_WINDOW",
            label,
            &format!("allowed={:?}", allowed),
        );
        Err(format!("Unauthorized IPC caller window: {label}"))
    }
}

#[tauri::command]
fn allow_app_close(window: tauri::WebviewWindow) -> Result<(), String> {
    require_window_label(&window, &["main"])?;
    ALLOW_CLOSE.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn exit_app(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    require_window_label(&window, &["main"])?;
    app.exit(0);
    Ok(())
}

#[derive(serde::Serialize)]
pub struct TrayState {
    widget_visible: bool,
    sticky_visible: bool,
    version: String,
}

#[tauri::command]
fn get_tray_state(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<TrayState, String> {
    require_window_label(&window, &["tray-menu"])?;
    let widget_visible = app.get_webview_window("widget")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let sticky_visible = app.get_webview_window("sticky-overlay")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let version = app.package_info().version.to_string();
    Ok(TrayState {
        widget_visible,
        sticky_visible,
        version,
    })
}

#[tauri::command]
fn tray_show_main(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<(), String> {
    require_window_label(&window, &["tray-menu"])?;
    if let Some(win) = app.get_webview_window("tray-menu") {
        let _ = win.hide();
    }
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.unminimize();
        let _ = main_window.show();
        let _ = main_window.set_focus();
        #[cfg(target_os = "windows")]
        if let Ok(hwnd) = main_window.hwnd() {
            use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SetForegroundWindow, SW_RESTORE, SW_SHOW};
            use windows::Win32::Foundation::HWND;
            unsafe {
                let h = HWND(hwnd.0 as *mut _);
                let _ = ShowWindow(h, SW_RESTORE);
                let _ = ShowWindow(h, SW_SHOW);
                let _ = SetForegroundWindow(h);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn tray_toggle_widget(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    require_window_label(&window, &["tray-menu"])?;
    let mut new_state = false;
    if let Some(win) = app.get_webview_window("widget") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
            new_state = false;
        } else {
            let _ = win.show();
            let _ = workerw::pin_widget_bottom_inner(&app);
            new_state = true;
        }
    }
    if let Some(win) = app.get_webview_window("tray-menu") {
        let _ = win.hide();
    }
    Ok(new_state)
}

#[tauri::command]
fn tray_toggle_sticky(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    require_window_label(&window, &["tray-menu"])?;
    let mut new_state = false;
    if let Some(win) = app.get_webview_window("sticky-overlay") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
            new_state = false;
        } else {
            let _ = win.show();
            let _ = workerw::pin_widget_bottom_inner(&app);
            new_state = true;
        }
    }
    if let Some(win) = app.get_webview_window("tray-menu") {
        let _ = win.hide();
    }
    Ok(new_state)
}

#[tauri::command]
fn tray_hide_menu(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<(), String> {
    require_window_label(&window, &["tray-menu"])?;
    if let Some(win) = app.get_webview_window("tray-menu") {
        let _ = win.hide();
    }
    Ok(())
}

#[tauri::command]
fn tray_quit_app(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<(), String> {
    require_window_label(&window, &["tray-menu"])?;
    if let Some(win) = app.get_webview_window("tray-menu") {
        let _ = win.hide();
    }
    let _ = app.emit("w_quit_requested", ());
    let app_clone = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        app_clone.exit(0);
    });
    Ok(())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("[W RUN] Starting pub fn run()...");

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Threading::CreateMutexW;
        use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
        use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, SendMessageW, ShowWindow, SetForegroundWindow, SW_RESTORE, SW_SHOW, WM_COPYDATA};
        use windows::Win32::System::DataExchange::COPYDATASTRUCT;
        use windows::core::w;

        // Named mutex held for process lifetime to strictly prevent concurrent instances
        let mutex = unsafe { CreateMutexW(None, true, w!("Global\\com.wapp.desktop-primary-guard")) };
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            println!("[W RUN] Another instance of W is already running. Forwarding signal & terminating duplicate process immediately.");
            
            // Poll for up to 1500ms to deliver WM_COPYDATA to the existing instance or bring main window to front
            let sic_class: Vec<u16> = "com.wapp.desktop-sic\0".encode_utf16().collect();
            let sic_win: Vec<u16> = "com.wapp.desktop-siw\0".encode_utf16().collect();
            let main_win_title: Vec<u16> = "W\0".encode_utf16().collect();

            for _ in 0..15 {
                // Try finding tauri-plugin-single-instance target window first
                if let Ok(sic_hwnd) = unsafe { FindWindowW(windows::core::PCWSTR(sic_class.as_ptr()), windows::core::PCWSTR(sic_win.as_ptr())) } {
                    if !sic_hwnd.0.is_null() {
                        let cwd = std::env::current_dir().unwrap_or_default();
                        let cwd_str = cwd.to_str().unwrap_or_default();
                        let args = std::env::args().collect::<Vec<String>>().join("|");
                        let data = format!("{cwd_str}|{args}\0");
                        let bytes = data.as_bytes();
                        let cds = COPYDATASTRUCT {
                            dwData: 1542, // WMCOPYDATA_SINGLE_INSTANCE_DATA
                            cbData: bytes.len() as u32,
                            lpData: bytes.as_ptr() as *mut _,
                        };
                        use windows::Win32::Foundation::{WPARAM, LPARAM};
                        unsafe {
                            let _ = SendMessageW(sic_hwnd, WM_COPYDATA, WPARAM(0), LPARAM(&cds as *const _ as isize));
                        }
                        break;
                    }
                }

                // Also try finding main window by title
                if let Ok(main_h) = unsafe { FindWindowW(None, windows::core::PCWSTR(main_win_title.as_ptr())) } {
                    if !main_h.0.is_null() {
                        unsafe {
                            let _ = ShowWindow(main_h, SW_RESTORE);
                            let _ = ShowWindow(main_h, SW_SHOW);
                            let _ = SetForegroundWindow(main_h);
                        }
                        break;
                    }
                }

                std::thread::sleep(std::time::Duration::from_millis(100));
            }

            // Unconditionally terminate secondary process so two instances never run concurrently
            std::process::exit(0);
        }

        // Store the mutex handle so it remains locked until this process completely exits
        if let Ok(h) = mutex {
            let _ = APP_MUTEX_HANDLE.set(h.0 as isize);
        }
    }

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            println!("[W RUN] Single instance trigger. Args: {:?}, Cwd: {:?}", args, cwd);
            if let Some(main_window) = app.get_webview_window("main") {
                println!("[W RUN] Showing main window due to single instance trigger.");
                let _ = main_window.unminimize();
                let _ = main_window.show();
                let _ = main_window.set_focus();

                #[cfg(target_os = "windows")]
                if let Ok(hwnd) = main_window.hwnd() {
                    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SetForegroundWindow, SW_RESTORE, SW_SHOW};
                    use windows::Win32::Foundation::HWND;
                    unsafe {
                        let h = HWND(hwnd.0 as *mut _);
                        let _ = ShowWindow(h, SW_RESTORE);
                        let _ = ShowWindow(h, SW_SHOW);
                        let _ = SetForegroundWindow(h);
                    }
                }
            }
        }));

    println!("[W RUN] Plugins initialized. Setting up...");

    builder
        .setup(|app| {
            println!("[W SETUP] Inside setup closure.");
            // ── Autolaunch (always locked in) ──────────────────────────────
            use tauri_plugin_autostart::ManagerExt;
            println!("[W SETUP] Enabling autolaunch...");
            let _ = app.autolaunch().enable();
            println!("[W SETUP] Autolaunch enabled.");

            // ── Startup visibility ─────────────────────────────────────────
            let args: Vec<String> = std::env::args().collect();
            let is_hidden_startup = args.contains(&"--hidden".to_string());

            if !is_hidden_startup {
                if let Some(main_window) = app.get_webview_window("main") {
                    println!("[W SETUP] Found main window. Visibility: {:?}", main_window.is_visible());
                    let _ = main_window.unminimize();
                    let res = main_window.show();
                    println!("[W SETUP] main_window.show() result: {:?}", res);
                    let res_focus = main_window.set_focus();
                    println!("[W SETUP] main_window.set_focus() result: {:?}", res_focus);

                    #[cfg(target_os = "windows")]
                    if let Ok(hwnd) = main_window.hwnd() {
                        use windows::Win32::UI::WindowsAndMessaging::{
                            GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow, SetForegroundWindow,
                            GWL_EXSTYLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW, SWP_NOMOVE, SWP_NOSIZE,
                            SW_RESTORE, SW_SHOW, HWND_TOP, GetWindowRect
                        };
                        use windows::Win32::Foundation::{HWND, RECT};
                        unsafe {
                            let h = HWND(hwnd.0 as *mut _);

                            // Force WS_EX_APPWINDOW so Windows Taskbar registers the app window
                            let ex_style = GetWindowLongPtrW(h, GWL_EXSTYLE);
                            let new_style = (ex_style as u32 | WS_EX_APPWINDOW.0) & !WS_EX_TOOLWINDOW.0;
                            SetWindowLongPtrW(h, GWL_EXSTYLE, new_style as isize);

                            let mut r = RECT::default();
                            let _ = GetWindowRect(h, &mut r);
                            println!("[W SETUP] HWND: {:?}, Rect: ({}, {}) -> ({}, {})", h, r.left, r.top, r.right, r.bottom);

                            let _ = ShowWindow(h, SW_RESTORE);
                            let _ = ShowWindow(h, SW_SHOW);
                            let _ = SetWindowPos(h, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
                            let _ = SetForegroundWindow(h);
                        }
                    }
                } else {
                    println!("[W SETUP] ERROR: main window NOT found!");
                }
            }

            // ── System Tray ────────────────────────────────────────────────
            println!("[W SETUP] Checking default window icon...");
            let icon = match app.default_window_icon() {
                Some(icon) => {
                    println!("[W SETUP] Default window icon found.");
                    icon.clone()
                }
                None => {
                    println!("[W SETUP] WARNING: Default window icon is None! Using fallback or empty icon.");
                    // Fallback to avoid panic
                    tauri::image::Image::new(&[], 0, 0)
                }
            };

            let _tray = TrayIconBuilder::with_id("main-tray")
                .show_menu_on_left_click(false)     // left-click shows window, right-click opens custom tray menu
                .icon(icon)
                .tooltip("W")
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } => {
                            let app = tray.app_handle();
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.unminimize();
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        TrayIconEvent::Click {
                            button: MouseButton::Right,
                            button_state: tauri::tray::MouseButtonState::Up,
                            position,
                            ..
                        } => {
                            let app = tray.app_handle();
                            if let Some(tray_win) = app.get_webview_window("tray-menu") {
                                if tray_win.is_visible().unwrap_or(false) {
                                    let _ = tray_win.hide();
                                    return;
                                }

                                let scale_factor = tray_win.scale_factor().unwrap_or(1.0);
                                let phys_w = (250.0 * scale_factor) as i32;
                                let phys_h = (215.0 * scale_factor) as i32;

                                let click_x = position.x as i32;
                                let click_y = position.y as i32;

                                let monitor = tray_win.current_monitor().ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
                                let (mon_x, mon_y, mon_w, mon_h) = if let Some(m) = monitor {
                                    let p = m.position();
                                    let s = m.size();
                                    (p.x, p.y, s.width as i32, s.height as i32)
                                } else {
                                    (0, 0, 1920, 1080)
                                };

                                let mut target_x = click_x - (phys_w / 2);
                                let mut target_y = click_y - phys_h - 10;

                                if target_y < mon_y {
                                    target_y = click_y + 10;
                                }

                                if target_x + phys_w > mon_x + mon_w - 10 {
                                    target_x = mon_x + mon_w - phys_w - 10;
                                }
                                if target_x < mon_x + 10 {
                                    target_x = mon_x + 10;
                                }

                                if target_y + phys_h > mon_y + mon_h - 10 {
                                    target_y = mon_y + mon_h - phys_h - 10;
                                }
                                if target_y < mon_y + 10 {
                                    target_y = mon_y + 10;
                                }

                                let _ = tray_win.set_position(Position::Physical(PhysicalPosition { x: target_x, y: target_y }));
                                let _ = tray_win.show();
                                let _ = tray_win.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // ── Desktop Z-Order Guard ──────────────────────────────────────
            workerw::start_desktop_zorder_guard(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workerw::embed_widget_in_desktop,
            workerw::detach_widget_from_desktop,
            workerw::pin_widget_bottom,
            workerw::move_widget_by,
            sticky_overlay::start_sticky_hit_test,
            sticky_overlay::stop_sticky_hit_test,
            sticky_overlay::update_sticky_regions,
            sticky_overlay::force_sticky_interactive,
            sticky_overlay::set_sticky_drag_mode,
            lockdown::start_lockdown_monitor,
            lockdown::stop_lockdown_monitor,
            lockdown::update_lockdown_blocklist,
            lockdown::test_lockdown_block,
            lockdown::kill_blocked_process,
            lockdown::close_blocked_tab,
            lockdown::update_lockdown_remaining,
            allow_app_close,
            exit_app,
            get_tray_state,
            tray_show_main,
            tray_toggle_widget,
            tray_toggle_sticky,
            tray_hide_menu,
            tray_quit_app,
            secure_store::secure_store_set,
            secure_store::secure_store_get,
            secure_store::secure_store_delete,
            secure_store::oauth_exchange_desktop_code,
            secure_store::oauth_refresh_desktop_token
        ])
        .on_window_event(|window, event| {
            let label = window.label().to_string();

            // Auto-dismiss tray menu popup when it loses focus (click outside)
            if label == "tray-menu" {
                if let tauri::WindowEvent::Focused(focused) = event {
                    if !focused {
                        let _ = window.hide();
                    }
                }
            }

            // Closing the main or widget window hides it (sends to tray) instead of exiting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if label == "main" || label == "widget" {
                    if !ALLOW_CLOSE.load(Ordering::SeqCst) {
                        let _ = window.hide();
                        api.prevent_close();
                    }
                }
            }

            // Keep the widget and sticky-overlay windows at the bottom of the Z-order
            if label == "widget" || label == "sticky-overlay" {
                match event {
                    tauri::WindowEvent::Focused(focused) => {
                        if *focused {
                            // Delay HWND_BOTTOM by 300ms so startDragging() has time
                            // to fire first. If a Moved event fires during that window,
                            // the user is dragging and we skip the pin.
                            #[cfg(target_os = "windows")]
                            {
                                if let Ok(hwnd) = window.hwnd() {
                                    let raw = hwnd.0 as isize;
                                    let focus_time = now_ms();
                                    std::thread::spawn(move || {
                                        std::thread::sleep(std::time::Duration::from_millis(300));
                                        // If a Moved event fired since we gained focus,
                                        // the user is dragging — don't pin to bottom
                                        let last_move = LAST_MOVE_EVENT_MS.load(Ordering::Relaxed);
                                        if last_move >= focus_time {
                                            return; // drag in progress, skip
                                        }
                                        use windows::Win32::UI::WindowsAndMessaging::{
                                            SetWindowPos, SWP_NOSIZE, SWP_NOMOVE, SWP_NOACTIVATE, HWND_BOTTOM,
                                        };
                                        use windows::Win32::Foundation::HWND;
                                        unsafe {
                                            let target = HWND(raw as *mut _);
                                            let _ = SetWindowPos(
                                                target,
                                                HWND_BOTTOM,
                                                0, 0, 0, 0,
                                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                                            );
                                        }
                                    });
                                }
                            }
                        } else {
                            // Immediately push to bottom when window loses focus
                            let _ = workerw::pin_widget_bottom_inner(&window.app_handle());
                        }
                    }
                    tauri::WindowEvent::Moved(_) => {
                        // Always record move timestamp (for drag detection)
                        LAST_MOVE_EVENT_MS.store(now_ms(), Ordering::Relaxed);

                        // Debounce: only call SetWindowPos at most once per 500ms
                        // to prevent saturating the window manager during drag
                        let now = now_ms();
                        let last = LAST_BOTTOM_PIN_MS.load(Ordering::Relaxed);
                        if now.saturating_sub(last) >= 500 {
                            LAST_BOTTOM_PIN_MS.store(now, Ordering::Relaxed);
                            #[cfg(target_os = "windows")]
                            {
                                use windows::Win32::UI::WindowsAndMessaging::{
                                    SetWindowPos, SWP_NOSIZE, SWP_NOMOVE, SWP_NOACTIVATE, HWND_BOTTOM,
                                };
                                use windows::Win32::Foundation::HWND;
                                if let Ok(hwnd) = window.hwnd() {
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
                    }
                    _ => {}
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
