// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{
    Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

mod workerw;
mod sticky_overlay;
mod lockdown;

static ALLOW_CLOSE: AtomicBool = AtomicBool::new(false);
static HIDDEN_OWNER_HWND: OnceLock<isize> = OnceLock::new();

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

#[cfg(target_os = "windows")]
fn get_child_pids(parent_pid: u32) -> Vec<u32> {
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW,
        PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows::Win32::Foundation::CloseHandle;

    let mut child_pids = Vec::new();
    unsafe {
        if let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            let mut pe = PROCESSENTRY32W::default();
            pe.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

            if Process32FirstW(snapshot, &mut pe).is_ok() {
                loop {
                    if pe.th32ParentProcessID == parent_pid {
                        child_pids.push(pe.th32ProcessID);
                    }
                    if Process32NextW(snapshot, &mut pe).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }
    }
    child_pids
}

#[cfg(target_os = "windows")]
fn get_all_descendant_pids(parent_pid: u32) -> Vec<u32> {
    let mut descendants = Vec::new();
    let mut to_process = vec![parent_pid];

    while !to_process.is_empty() {
        let mut next_generation = Vec::new();
        for pid in to_process {
            let children = get_child_pids(pid);
            for child in children {
                descendants.push(child);
                next_generation.push(child);
            }
        }
        to_process = next_generation;
    }
    descendants
}

#[cfg(target_os = "windows")]
fn enable_efficiency_mode_for_pid(pid: u32) {
    use windows::Win32::System::Threading::{
        OpenProcess, SetPriorityClass, SetProcessInformation,
        IDLE_PRIORITY_CLASS, PROCESS_POWER_THROTTLING_STATE,
        PROCESS_POWER_THROTTLING_CURRENT_VERSION,
        PROCESS_POWER_THROTTLING_EXECUTION_SPEED, ProcessPowerThrottling,
        PROCESS_SET_INFORMATION,
    };
    use windows::Win32::Foundation::CloseHandle;

    unsafe {
        if let Ok(handle) = OpenProcess(PROCESS_SET_INFORMATION, false, pid) {
            let _ = SetPriorityClass(handle, IDLE_PRIORITY_CLASS);

            let throttling_state = PROCESS_POWER_THROTTLING_STATE {
                Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
                ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
                StateMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
            };

            let _ = SetProcessInformation(
                handle,
                ProcessPowerThrottling,
                &throttling_state as *const _ as *const _,
                std::mem::size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
            );
            let _ = CloseHandle(handle);
        }
    }
}

#[cfg(target_os = "windows")]
pub fn enable_efficiency_mode() {
    use windows::Win32::System::Threading::{
        GetCurrentProcess, GetCurrentProcessId, SetPriorityClass, SetProcessInformation,
        IDLE_PRIORITY_CLASS, PROCESS_POWER_THROTTLING_STATE,
        PROCESS_POWER_THROTTLING_CURRENT_VERSION,
        PROCESS_POWER_THROTTLING_EXECUTION_SPEED, ProcessPowerThrottling,
    };

    unsafe {
        let handle = GetCurrentProcess();

        // Lower priority to Idle
        let _ = SetPriorityClass(handle, IDLE_PRIORITY_CLASS);

        // Turn on power throttling (EcoQoS)
        let throttling_state = PROCESS_POWER_THROTTLING_STATE {
            Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
            ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
            StateMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
        };

        let _ = SetProcessInformation(
            handle,
            ProcessPowerThrottling,
            &throttling_state as *const _ as *const _,
            std::mem::size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
        );
    }

    // Spawn a background thread to continually discover and apply EcoQoS to all child WebView2 processes
    std::thread::spawn(move || {
        let parent_pid = unsafe { GetCurrentProcessId() };
        loop {
            let descendants = get_all_descendant_pids(parent_pid);
            for pid in descendants {
                enable_efficiency_mode_for_pid(pid);
            }
            std::thread::sleep(std::time::Duration::from_secs(5));
        }
    });
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
            #[cfg(target_os = "windows")]
            {
                println!("[W SETUP] Enabling Windows Efficiency Mode (EcoQoS)...");
                enable_efficiency_mode();
            }
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

            // Window Monitor Thread
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    let windows = app_handle.webview_windows();
                    println!("[W MONITOR] --- Window Status Report ---");
                    for (label, win) in windows {
                        let visible = win.is_visible();
                        let pos = win.outer_position();
                        let size = win.outer_size();
                        let hwnd = win.hwnd();
                        println!("[W MONITOR] Window '{}' -> Visible: {:?}, Position: {:?}, Size: {:?}, HWND: {:?}", label, visible, pos, size, hwnd);
                    }
                }
            });

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
                    tauri::WindowEvent::Moved(_) => {
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
                    _ => {}
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
