// Sticky overlay hit-testing for Windows.
//
// ARCHITECTURE:
// - A background thread polls GetCursorPos() at ~60fps (16ms intervals)
// - When cursor enters a sticky note region → set_ignore_cursor_events(false)
//   so the webview receives pointer events
// - When cursor leaves all regions → set_ignore_cursor_events(true)
//   so clicks pass through to the desktop/taskbar
// - During drag mode, the window is ALWAYS interactive to prevent
//   stutter from the cursor leaving the note's bounding box mid-drag
//
// CLICK-THROUGH — TWO-LAYER STRATEGY:
// Layer 1 (Tauri): set_ignore_cursor_events() on the WebviewWindow — toggled
//   by the polling thread.
//
// Layer 2 (CSS): pointer-events: none on .sticky-canvas — ensures the
//   WebView2 renderer ignores clicks on empty space even if the ignores state
//   have not toggled yet. Individual .sticky-note elements override
//   with pointer-events: auto.

use std::sync::atomic::{AtomicBool, Ordering, AtomicU64};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use tauri::Manager;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::POINT;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

#[cfg(target_os = "windows")]
pub fn set_click_through(hwnd: isize, ignore: bool) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, GWLP_HWNDPARENT,
        WS_EX_TRANSPARENT, WS_EX_LAYERED, WS_EX_NOACTIVATE,
        WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
    };
    unsafe {
        let target = windows::Win32::Foundation::HWND(hwnd as *mut _);
        
        // 1. Set owner to hidden owner
        let owner = crate::get_hidden_owner();
        SetWindowLongPtrW(target, GWLP_HWNDPARENT, owner);

        // 2. Adjust hit testing and taskbar styles
        let ex_style = GetWindowLongPtrW(target, GWL_EXSTYLE) as u32;
        let mut new_style = ex_style;
        
        if ignore {
            new_style |= WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0;
        } else {
            new_style &= !(WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0);
        }
        
        // Ensure WS_EX_NOACTIVATE is set
        new_style |= WS_EX_NOACTIVATE.0;
        // Ensure WS_EX_TOOLWINDOW and WS_EX_APPWINDOW are NOT set (hides from taskbar, retains Task Manager registration via owner)
        new_style &= !WS_EX_TOOLWINDOW.0 & !WS_EX_APPWINDOW.0;
        
        if new_style != ex_style {
            SetWindowLongPtrW(target, GWL_EXSTYLE, new_style as isize);
        }
    }
}

// ─── Shared state ────────────────────────────────────────────────

#[derive(Clone)]
struct StickyRect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

/// Regions that are "interactive" (sticky note bounding boxes, DPI-scaled)
static REGIONS: Mutex<Vec<StickyRect>> = Mutex::new(Vec::new());

/// Controls the polling thread lifecycle
static RUNNING: AtomicBool = AtomicBool::new(false);
static POLLING_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Current click-through state (true = ignoring cursor events = click-through)
static IS_IGNORING: AtomicBool = AtomicBool::new(true);

/// When true, force the window interactive (disable click-through).
/// Set during drag to prevent stutter.
static DRAG_MODE: AtomicBool = AtomicBool::new(false);

// ─── Helpers ─────────────────────────────────────────────────────

fn point_in_any_region(x: i32, y: i32, regions: &[StickyRect]) -> bool {
    // Generous padding for easier targeting
    const PAD: i32 = 16;
    for r in regions {
        if x >= r.left - PAD
            && x <= r.right + PAD
            && y >= r.top - PAD
            && y <= r.bottom + PAD
        {
            return true;
        }
    }
    false
}

fn point_near_any_region(x: i32, y: i32, regions: &[StickyRect]) -> bool {
    const NEAR_THRESHOLD: i32 = 150;
    for r in regions {
        let dx = if x < r.left {
            r.left - x
        } else if x > r.right {
            x - r.right
        } else {
            0
        };
        let dy = if y < r.top {
            r.top - y
        } else if y > r.bottom {
            y - r.bottom
        } else {
            0
        };
        if dx <= NEAR_THRESHOLD && dy <= NEAR_THRESHOLD {
            return true;
        }
    }
    false
}

// ─── Polling thread ──────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn start_polling(app_handle: tauri::AppHandle) {
    let gen = POLLING_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    RUNNING.store(true, Ordering::SeqCst);

    let window = app_handle.get_webview_window("sticky-overlay");

    thread::spawn(move || {
        let Some(win) = window else {
            RUNNING.store(false, Ordering::SeqCst);
            return;
        };

        while RUNNING.load(Ordering::SeqCst) && POLLING_GENERATION.load(Ordering::SeqCst) == gen {
            let mut pt = POINT::default();
            let got_pos = unsafe { GetCursorPos(&mut pt).is_ok() };

            let mut near_region = false;
            let mut in_drag = false;

            if got_pos {
                let over_note = {
                    if let Ok(guard) = REGIONS.lock() {
                        near_region = point_near_any_region(pt.x, pt.y, &guard);
                        point_in_any_region(pt.x, pt.y, &guard)
                    } else {
                        false
                    }
                };

                in_drag = DRAG_MODE.load(Ordering::Relaxed);
                let should_ignore = !over_note && !in_drag;
                let currently_ignoring = IS_IGNORING.load(Ordering::Relaxed);

                // Toggle only when state changes
                if should_ignore != currently_ignoring {
                    if let Ok(hwnd) = win.hwnd() {
                        set_click_through(hwnd.0 as isize, should_ignore);
                    }
                    IS_IGNORING.store(should_ignore, Ordering::Relaxed);
                }
            }

            // Dynamic sleep throttling based on distance
            let sleep_dur = if near_region || in_drag {
                16
            } else {
                100
            };
            thread::sleep(Duration::from_millis(sleep_dur));
        }
    });
}

fn stop_polling() {
    RUNNING.store(false, Ordering::SeqCst);
    POLLING_GENERATION.fetch_add(1, Ordering::SeqCst);
    thread::sleep(Duration::from_millis(50));
}

// ─── Tauri commands ──────────────────────────────────────────────

#[derive(Deserialize)]
pub struct JsRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

/// Start the polling thread that toggles click-through on the sticky overlay.
#[tauri::command]
pub fn start_sticky_hit_test(app: tauri::AppHandle) -> Result<(), String> {
    let overlay = app
        .get_webview_window("sticky-overlay")
        .ok_or("sticky-overlay window not found")?;

    stop_polling();

    // Configure WebView2 compositor for click-through
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = overlay.hwnd() {
            set_click_through(hwnd.0 as isize, true);
        }
    }
    #[cfg(not(target_os = "windows"))]
    overlay
        .set_ignore_cursor_events(true)
        .map_err(|e| format!("set_ignore_cursor_events failed: {e}"))?;

    IS_IGNORING.store(true, Ordering::SeqCst);
    DRAG_MODE.store(false, Ordering::SeqCst);

    if let Ok(mut guard) = REGIONS.lock() {
        guard.clear();
    }

    #[cfg(target_os = "windows")]
    start_polling(app);

    Ok(())
}

/// Stop the polling thread.
#[tauri::command]
pub fn stop_sticky_hit_test() -> Result<(), String> {
    stop_polling();
    Ok(())
}

/// Update the sticky note bounding boxes for hit-testing.
/// Coordinates must be in physical (screen) pixels.
#[tauri::command]
pub fn update_sticky_regions(regions: Vec<JsRect>) -> Result<(), String> {
    let rects: Vec<StickyRect> = regions
        .into_iter()
        .map(|r| StickyRect {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
        })
        .collect();
    if let Ok(mut guard) = REGIONS.lock() {
        *guard = rects;
    }
    Ok(())
}

/// Force the overlay to be interactive right now.
/// Called on pointerDown to ensure the first click registers
/// even if the polling thread hasn't caught up yet.
#[tauri::command]
pub fn force_sticky_interactive(app: tauri::AppHandle) -> Result<(), String> {
    if IS_IGNORING.load(Ordering::Relaxed) {
        if let Some(window) = app.get_webview_window("sticky-overlay") {
            #[cfg(target_os = "windows")]
            {
                if let Ok(hwnd) = window.hwnd() {
                    set_click_through(hwnd.0 as isize, false);
                }
            }
            #[cfg(not(target_os = "windows"))]
            window
                .set_ignore_cursor_events(false)
                .map_err(|e| format!("force interactive failed: {e}"))?;
            IS_IGNORING.store(false, Ordering::Relaxed);
        }
    }
    Ok(())
}

/// Toggle drag mode. When dragging, the overlay stays interactive
/// regardless of cursor position to prevent stutter.
#[tauri::command]
pub fn set_sticky_drag_mode(app: tauri::AppHandle, dragging: bool) -> Result<(), String> {
    DRAG_MODE.store(dragging, Ordering::SeqCst);

    if dragging {
        // Immediately make interactive
        if IS_IGNORING.load(Ordering::Relaxed) {
            if let Some(window) = app.get_webview_window("sticky-overlay") {
                #[cfg(target_os = "windows")]
                {
                    if let Ok(hwnd) = window.hwnd() {
                        set_click_through(hwnd.0 as isize, false);
                    }
                }
                #[cfg(not(target_os = "windows"))]
                let _ = window.set_ignore_cursor_events(false);
                IS_IGNORING.store(false, Ordering::Relaxed);
            }
        }
    }

    Ok(())
}
