// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{Emitter, Manager};

mod workerw;
mod sticky_overlay;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

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
            let args: Vec<String> = std::env::args().collect();
            let is_hidden_startup = args.contains(&"--hidden".to_string());

            if !is_hidden_startup {
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.show();
                    let _ = main_window.set_focus();
                }
            }

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
                loop {
                    interval.tick().await;
                    let _ = app_handle.emit("background-tick", ());
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            workerw::embed_widget_in_desktop,
            workerw::detach_widget_from_desktop,
            workerw::pin_widget_bottom,
            workerw::move_widget_by,
            sticky_overlay::start_sticky_hit_test,
            sticky_overlay::stop_sticky_hit_test,
            sticky_overlay::update_sticky_regions,
            sticky_overlay::force_sticky_interactive,
            sticky_overlay::set_sticky_drag_mode
        ])
        .on_window_event(|window, event| {
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

