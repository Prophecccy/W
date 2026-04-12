// Sticky overlay hit-testing for Windows.
//
// Uses a dedicated polling thread that checks cursor position against
// registered sticky note regions and toggles Tauri's built-in
// set_ignore_cursor_events() accordingly.
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
// WHY NOT WS_EX_TRANSPARENT?
// Tauri's set_ignore_cursor_events() handles platform-specific quirks
// internally (DWM, compositor, etc). Raw WS_EX_TRANSPARENT via
// SetWindowLongPtrW doesn't take effect without SWP_FRAMECHANGED
// and fights with Tauri's own window management.
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
use windows::Win32::Foundation::POINT;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

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

/// Current click-through state (true = ignoring cursor events = click‐through)
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

// ─── Polling thread ──────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn start_polling(app_handle: tauri::AppHandle) {
    RUNNING.store(true, Ordering::SeqCst);

    thread::spawn(move || {
        while RUNNING.load(Ordering::SeqCst) {
            // 1. Get cursor position (physical/screen coordinates)
            let mut pt = POINT::default();
            let got_pos = unsafe { GetCursorPos(&mut pt).is_ok() };

            if got_pos {
                // 2. Check if cursor is over any sticky note region
                let over_note = {
                    if let Ok(guard) = REGIONS.lock() {
                        point_in_any_region(pt.x, pt.y, &guard)
                    } else {
                        false
                    }
                };

                // 3. Determine desired state
                let in_drag = DRAG_MODE.load(Ordering::Relaxed);
                let should_ignore = !over_note && !in_drag;
                let currently_ignoring = IS_IGNORING.load(Ordering::Relaxed);

                // 4. Toggle only when state changes
                if should_ignore != currently_ignoring {
                    if let Some(window) = app_handle.get_webview_window("sticky-overlay") {
                        if window.set_ignore_cursor_events(should_ignore).is_ok() {
                            IS_IGNORING.store(should_ignore, Ordering::Relaxed);
                        }
                    }
                }
            }

            thread::sleep(Duration::from_millis(16));
        }
    });
}

fn stop_polling() {
    RUNNING.store(false, Ordering::SeqCst);
    // Give the thread time to exit
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
    // Verify the overlay window exists
    let overlay = app
        .get_webview_window("sticky-overlay")
        .ok_or("sticky-overlay window not found")?;

    // Stop any existing polling
    stop_polling();

    // Start with click-through enabled
    overlay
        .set_ignore_cursor_events(true)
        .map_err(|e| format!("set_ignore_cursor_events failed: {e}"))?;
    IS_IGNORING.store(true, Ordering::SeqCst);
    DRAG_MODE.store(false, Ordering::SeqCst);

    // Clear old regions
    if let Ok(mut guard) = REGIONS.lock() {
        guard.clear();
    }

    // Start the polling thread
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
/// Used on pointerDown to ensure the first click registers
/// even if the polling thread hasn't caught up yet.
#[tauri::command]
pub fn force_sticky_interactive(app: tauri::AppHandle) -> Result<(), String> {
    if IS_IGNORING.load(Ordering::Relaxed) {
        if let Some(window) = app.get_webview_window("sticky-overlay") {
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
                let _ = window.set_ignore_cursor_events(false);
                IS_IGNORING.store(false, Ordering::Relaxed);
            }
        }
    }
    // When dragging ends (dragging=false), the polling thread will
    // naturally re-evaluate and set click-through if needed.

    Ok(())
}
