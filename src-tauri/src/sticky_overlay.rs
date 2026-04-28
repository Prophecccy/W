// Sticky overlay hit-testing for Windows.
//
// ARCHITECTURE:
// - A background thread polls GetCursorPos() at ~60fps (16ms intervals)
// - When cursor enters a sticky note region → remove WS_EX_TRANSPARENT
//   so the webview receives pointer events
// - When cursor leaves all regions → add WS_EX_TRANSPARENT
//   so clicks pass through to the desktop/taskbar
// - During drag mode, the window is ALWAYS interactive to prevent
//   stutter from the cursor leaving the note's bounding box mid-drag
//
// CLICK-THROUGH — TWO-LAYER STRATEGY:
// Layer 1 (Win32): WS_EX_TRANSPARENT on the HWND — toggled atomically
//   by the polling thread via set_click_through(). WS_EX_NOACTIVATE and
//   WS_EX_TOOLWINDOW are always preserved in the same write.
//
// Layer 2 (CSS): pointer-events: none on .sticky-canvas — ensures the
//   WebView2 renderer ignores clicks on empty space even if the Win32
//   flag hasn't toggled yet. Individual .sticky-note elements override
//   with pointer-events: auto.
//
// INIT: start_sticky_hit_test() calls Tauri's set_ignore_cursor_events(true)
//   ONCE to properly configure the WebView2 compositor for click-through.
//   All subsequent toggles use direct Win32 only (no async dispatch, no
//   glitching from rapid Tauri calls in the polling loop).
//
// WHY NOT WH_MOUSE_LL?
// Low-level mouse hooks require a message pump on the installer thread.
// Tauri command handlers run on a tokio thread pool with no message pump.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use tauri::Manager;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HWND, POINT};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
};

// ─── Send-safe HWND wrapper ─────────────────────────────────────
// HWND wraps *mut c_void so the windows crate doesn't impl Send.
// Window handles are process-wide and safe to use from any thread.
#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
struct SendHwnd(HWND);
#[cfg(target_os = "windows")]
unsafe impl Send for SendHwnd {}

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

/// The flags that MUST always be present on the overlay window.
/// - WS_EX_NOACTIVATE: never become the foreground/active window
/// - WS_EX_TOOLWINDOW: no Alt-Tab entry, no taskbar button
#[cfg(target_os = "windows")]
const PERMANENT_FLAGS: isize =
    WS_EX_NOACTIVATE.0 as isize | WS_EX_TOOLWINDOW.0 as isize;

/// Atomically set click-through state on the overlay window.
///
/// All flags are written in a single `SetWindowLongPtrW` call:
/// - WS_EX_NOACTIVATE + WS_EX_TOOLWINDOW are always present
/// - WS_EX_TRANSPARENT is added (click-through) or removed (interactive)
#[cfg(target_os = "windows")]
fn set_click_through(hwnd: HWND, ignore: bool) {
    unsafe {
        let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let transparent_bit = WS_EX_TRANSPARENT.0 as isize;

        let new_style = if ignore {
            (current | transparent_bit) | PERMANENT_FLAGS
        } else {
            (current & !transparent_bit) | PERMANENT_FLAGS
        };

        // Only write if something actually changed
        if new_style != current {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
        }
    }
}

/// Extract the native HWND from a Tauri WebviewWindow.
#[cfg(target_os = "windows")]
fn get_hwnd(window: &tauri::WebviewWindow) -> Option<HWND> {
    match window.hwnd() {
        Ok(hwnd) => Some(HWND(hwnd.0 as *mut _)),
        Err(_) => None,
    }
}

// ─── Polling thread ──────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn start_polling(app_handle: tauri::AppHandle) {
    RUNNING.store(true, Ordering::SeqCst);

    // Cache the HWND once — avoids string lookups + Arc clones every 16ms.
    let send_hwnd = {
        let window = app_handle.get_webview_window("sticky-overlay");
        window.and_then(|w| get_hwnd(&w)).map(SendHwnd)
    };

    thread::spawn(move || {
        let Some(SendHwnd(hwnd)) = send_hwnd else {
            RUNNING.store(false, Ordering::SeqCst);
            return;
        };

        while RUNNING.load(Ordering::SeqCst) {
            let mut pt = POINT::default();
            let got_pos = unsafe { GetCursorPos(&mut pt).is_ok() };

            if got_pos {
                let over_note = {
                    if let Ok(guard) = REGIONS.lock() {
                        point_in_any_region(pt.x, pt.y, &guard)
                    } else {
                        false
                    }
                };

                let in_drag = DRAG_MODE.load(Ordering::Relaxed);
                let should_ignore = !over_note && !in_drag;
                let currently_ignoring = IS_IGNORING.load(Ordering::Relaxed);

                // Toggle only when state changes — single atomic Win32 call
                if should_ignore != currently_ignoring {
                    set_click_through(hwnd, should_ignore);
                    IS_IGNORING.store(should_ignore, Ordering::Relaxed);
                }
            }

            thread::sleep(Duration::from_millis(16));
        }
    });
}

fn stop_polling() {
    RUNNING.store(false, Ordering::SeqCst);
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

    // INIT: Use Tauri's method ONCE to configure WebView2 compositor
    // for click-through. All subsequent toggles use direct Win32.
    overlay
        .set_ignore_cursor_events(true)
        .map_err(|e| format!("set_ignore_cursor_events failed: {e}"))?;

    // Immediately enforce permanent flags (Tauri may have clobbered them)
    #[cfg(target_os = "windows")]
    if let Some(hwnd) = get_hwnd(&overlay) {
        set_click_through(hwnd, true);
    }

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
            if let Some(hwnd) = get_hwnd(&window) {
                set_click_through(hwnd, false);
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
                if let Some(hwnd) = get_hwnd(&window) {
                    set_click_through(hwnd, false);
                }
                #[cfg(not(target_os = "windows"))]
                let _ = window.set_ignore_cursor_events(false);

                IS_IGNORING.store(false, Ordering::Relaxed);
            }
        }
    }
    // When dragging ends (dragging=false), the polling thread will
    // naturally re-evaluate and set click-through if needed.

    Ok(())
}
