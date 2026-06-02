// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{
    Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};

mod workerw;
mod sticky_overlay;
mod lockdown;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.show();
                let _ = main_window.set_focus();
            }
        }))
        .setup(|app| {
            // ── Autolaunch (always locked in) ──────────────────────────────
            use tauri_plugin_autostart::ManagerExt;
            let _ = app.autolaunch().enable();

            // ── Startup visibility ─────────────────────────────────────────
            let args: Vec<String> = std::env::args().collect();
            let is_hidden_startup = args.contains(&"--hidden".to_string());

            if !is_hidden_startup {
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.show();
                    let _ = main_window.set_focus();
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

            let _tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false)     // left-click shows window, right-click opens menu
                .icon(app.default_window_icon().unwrap().clone())
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
                            }
                        }
                    }
                    "toggle_sticky" => {
                        if let Some(win) = app.get_webview_window("sticky-overlay") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
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
            lockdown::update_lockdown_remaining
        ])
        .on_window_event(|window, event| {
            // Closing the main window hides it (sends to tray) instead of exiting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
