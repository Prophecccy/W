// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{
    Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;

mod workerw;
mod sticky_overlay;
mod lockdown;

static ALLOW_CLOSE: AtomicBool = AtomicBool::new(false);
static HIDDEN_OWNER_HWND: OnceLock<isize> = OnceLock::new();

/// Debounce timestamp (epoch millis) for SetWindowPos calls during drag.
/// Prevents hundreds of Win32 calls per second when a window is being moved.
static LAST_BOTTOM_PIN_MS: AtomicU64 = AtomicU64::new(0);

/// Tracks the last Moved event timestamp (always updated, no debounce).
/// Used by the Focused handler to detect if a drag is in progress.
static LAST_MOVE_EVENT_MS: AtomicU64 = AtomicU64::new(0);

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
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
fn allow_app_close() {
    ALLOW_CLOSE.store(true, Ordering::SeqCst);
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("[W RUN] Starting pub fn run()...");
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
                let _ = main_window.show();
                let _ = main_window.set_focus();
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
                    let res = main_window.show();
                    println!("[W SETUP] main_window.show() result: {:?}", res);
                    let res_focus = main_window.set_focus();
                    println!("[W SETUP] main_window.set_focus() result: {:?}", res_focus);
                } else {
                    println!("[W SETUP] ERROR: main window NOT found!");
                }
            }

            // ── System Tray ────────────────────────────────────────────────
            let show_item = MenuItem::with_id(
                app,
                "show",
                "[ Show W ]",
                true,
                None::<&str>,
            )?;

            let toggle_widget_item = MenuItem::with_id(
                app,
                "toggle_widget",
                "[ Toggle Widget ]",
                true,
                None::<&str>,
            )?;

            let toggle_sticky_item = MenuItem::with_id(
                app,
                "toggle_sticky",
                "[ Toggle Sticky Notes ]",
                true,
                None::<&str>,
            )?;

            let separator = PredefinedMenuItem::separator(app)?;

            let quit_item = MenuItem::with_id(
                app,
                "quit",
                "[ Quit 'W' ]",
                true,
                None::<&str>,
            )?;

            let tray_menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &toggle_widget_item,
                    &toggle_sticky_item,
                    &separator,
                    &quit_item,
                ],
            )?;

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

            let _tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false)     // left-click shows window, right-click opens menu
                .icon(icon)
                .tooltip("W")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "toggle_widget" => {
                        if let Some(win) = app.get_webview_window("widget") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = workerw::pin_widget_bottom(app.clone());
                            }
                        }
                    }
                    "toggle_sticky" => {
                        if let Some(win) = app.get_webview_window("sticky-overlay") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = workerw::pin_widget_bottom(app.clone());
                            }
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Double-click on the tray icon opens the main window
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;



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
            lockdown::update_lockdown_remaining,
            allow_app_close
        ])
        .on_window_event(|window, event| {
            let label = window.label().to_string();

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
