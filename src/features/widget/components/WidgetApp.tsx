import { useEffect, useState, useRef, useCallback } from 'react';
import { useWidgetData } from '../hooks/useWidgetData';
import { StatsDeck } from './StatsDeck/StatsDeck';
import { WidgetHabitList } from './HabitList/WidgetHabitList';
import { loadWidgetPosition, saveWidgetPosition } from '../services/widgetPositionStore';
import { ShieldAlert } from 'lucide-react';
import { getLocalWallpaper } from '../../../shared/utils/storageUtils';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { SleepTube } from '../../dashboard/components/SleepTube';
import { ProgressCircle } from '../../../shared/components/ProgressCircle/ProgressCircle';
import './WidgetApp.css';

export function WidgetApp() {
  const {
    today,
    todayLog,
    periodLogs,
    userDoc,
    loading,
    scheduledHabits,
    completedCount,
    totalScheduled,
    completeHabit,
    undoHabit,
  } = useWidgetData();

  const strikeCount = userDoc?.strikes?.current ?? 0;
  const isLocked = strikeCount >= 5;
  const isFrozen = userDoc?.freeze?.active === true;

  // ─── Real-Time Clock ─────────────────────────────────────
  const [timeString, setTimeString] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      setTimeString(`${hrs}:${mins}:${secs}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Z-Order Enforcer: Active Defense ───────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    async function setupZOrderDefense() {
      try {
        const { getCurrentWebviewWindow, WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const { invoke } = await import("@tauri-apps/api/core");
        const currentWin = getCurrentWebviewWindow();
        unlisten = await currentWin.onFocusChanged(async ({ payload: focused }) => {
          if (focused) {
            // Force main window back to top if open and not minimized
            try {
              const mainWin = await WebviewWindow.getByLabel("main");
              if (mainWin) {
                const isMin = await mainWin.isMinimized();
                if (!isMin) await mainWin.setFocus();
              }
            } catch {}
            // Push self back to bottom native layer
            try { await invoke("pin_widget_bottom"); } catch {}
          }
        });
      } catch { /* Not in Tauri */ }
    }
    setupZOrderDefense();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // ─── Manual Drag State ───────────────────────────────────
  // ALL drag handlers are synchronous — no awaits allowed in the drag path.
  // The actual window move is handled natively by Rust (move_widget_by).
  // Z-Order defense is DEFERRED to pointerUp (tap-only) so it doesn't
  // steal focus or push the window behind others mid-drag.
  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Skip interactive children — but NOT the scroll container itself
    if (e.target instanceof Element && (
      e.target.closest('.widget-habit-card') ||
      e.target.closest('button') ||
      e.target.closest('a') ||
      e.target.closest('.widget-app__lockout')
    )) return;

    // Only primary button (left click)
    if (e.button !== 0) return;

    isDragging.current = true;
    dragMoved.current = false;
    const dpr = window.devicePixelRatio || 1;
    lastPos.current = { x: e.screenX * dpr, y: e.screenY * dpr };
    // MUST be called synchronously — captures pointer even outside window bounds
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;

    const dpr = window.devicePixelRatio || 1;
    const currentX = e.screenX * dpr;
    const currentY = e.screenY * dpr;

    const dx = Math.round(currentX - lastPos.current.x);
    const dy = Math.round(currentY - lastPos.current.y);

    if (dx === 0 && dy === 0) return;

    dragMoved.current = true;
    // Store absolute physical position plus offset to prevent fractional drift over time
    lastPos.current = { x: lastPos.current.x + dx, y: lastPos.current.y + dy };
    // Fire-and-forget — Rust handles the native move synchronously
    invoke('move_widget_by', { dx, dy });
  }, []);

  const handlePointerUp = useCallback(() => {
    const wasDrag = dragMoved.current;
    isDragging.current = false;
    dragMoved.current = false;

    // ── Z-Order Enforcer: only on TAP (no drag movement) ──
    // During a drag we must NOT steal focus or re-pin, otherwise
    // the window gets sent behind other windows mid-move.
    if (!wasDrag) {
      try {
        invoke("pin_widget_bottom");
        import("@tauri-apps/api/webviewWindow").then(({ WebviewWindow }) => {
          WebviewWindow.getByLabel("main").then(main => {
            if (main) {
              main.isMinimized().then(isMin => {
                if (!isMin) main.setFocus();
              });
            }
          });
        });
      } catch {}
    }
  }, []);

  // ─── Wallpaper ───────────────────────────────────────────
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);

  useEffect(() => {
    async function applyWallpaper() {
      try {
        const widgetUrl = await getLocalWallpaper("widget");
        setWallpaperUrl(widgetUrl || null);
      } catch {
        setWallpaperUrl(null);
      }
    }

    applyWallpaper();
    
    const channel = new BroadcastChannel('w_channel');
    channel.onmessage = (e) => {
      if (e.data.type === 'WALLPAPER_CHANGED') {
        applyWallpaper();
      }
    };
    
    window.addEventListener("wallpaper-changed", applyWallpaper);
    return () => {
      channel.close();
      window.removeEventListener("wallpaper-changed", applyWallpaper);
    };
  }, []);
  const dimIntensity = userDoc?.aesthetics?.widget?.dimIntensity ?? 0.7;
  const blurIntensity = userDoc?.aesthetics?.widget?.blurIntensity ?? 0;
  const accentColor = userDoc?.aesthetics?.widget?.accentColor ?? userDoc?.aesthetics?.desktop?.accentColor ?? '#5B8DEF';
  const cropX = userDoc?.aesthetics?.widget?.cropX ?? 50;
  const cropY = userDoc?.aesthetics?.widget?.cropY ?? 50;

  // Apply accent color to widget
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor);

    // Listen for live preview from main settings window
    const unlistenPromise = listen<string>('color-preview', (event) => {
      document.documentElement.style.setProperty('--accent', event.payload);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten()).catch(() => {});
    };
  }, [accentColor]);

  // ─── Auto-resize window height to fit habit count ─────────
  useEffect(() => {
    async function resizeToContent() {
      try {
        const win = getCurrentWindow();
        const scaleFactor = await win.scaleFactor();

        // CSS Pixel-Matched Metrics
        const CARD_H       = 52;  // Card padding + title text height
        const CARD_GAP     = 12;  // Card margin-bottom
        const HEADER_H     = 34;  // .widget-app__header height + padding
        const PANEL_GAP    = 12;  // .widget-app__right-panel gaps
        const STATS_DECK_H = 80;  // Actual height of stats deck
        const CLOCK_H      = 72;  // .widget-app__clock-container height (enlarged clock)
        const INSET        = 48;  // Window absolute offset (16px) + content padding (32px)
        const EMPTY_H      = 60;  // Height of empty habits state

        const n = scheduledHabits.length;
        const regularHabits = scheduledHabits.filter(h => h.type !== 'limiter');
        const limiterHabits = scheduledHabits.filter(h => h.type === 'limiter');

        // Calculate the habit list area height
        let habitAreaHeight = 0;
        if (n > 0) {
          habitAreaHeight += regularHabits.length * (CARD_H + CARD_GAP);
          if (limiterHabits.length > 0) {
            habitAreaHeight += 24; // .widget-habit-list__section-header [LIMITERS] height
            habitAreaHeight += limiterHabits.length * (CARD_H + CARD_GAP);
          }
        } else {
          habitAreaHeight += EMPTY_H;
        }

        // Calculate Right Panel: 4 components with 3 vertical gaps
        const targetLogicalRightPanel = HEADER_H + habitAreaHeight + STATS_DECK_H + CLOCK_H + (3 * PANEL_GAP);
        
        // Left Panel: Progress circle (40px) + margin (12px) + SleepTube container (200px)
        const targetLogicalLeftPanel = 252;

        // Outer window logical height is the maximum panel height + vertical padding/inset
        const targetLogical = Math.max(targetLogicalRightPanel, targetLogicalLeftPanel) + INSET;
        
        // Apply an additional 24px rendering safety buffer
        const targetLogicalWithBuffer = targetLogical + 24;

        const clamped = Math.max(300, Math.min(800, targetLogicalWithBuffer));
        const targetPhysical = Math.round(clamped * scaleFactor);

        const currentSize = await win.innerSize();
        if (Math.abs(currentSize.height - targetPhysical) > 2) {
          await win.setSize(new PhysicalSize(currentSize.width, targetPhysical));
          const pos = await win.outerPosition();
          saveWidgetPosition({
            x: pos.x,
            y: pos.y,
            width: currentSize.width,
            height: targetPhysical,
          });
        }
      } catch {
        // Not in Tauri context
      }
    }

    if (!loading) resizeToContent();
  }, [scheduledHabits.length, loading]);

  // ─── Restore & persist widget position ───────────────────
  useEffect(() => {
    let cleanup = false;

    async function initPosition() {
      try {
        const win = getCurrentWindow();
        const saved = await loadWidgetPosition();

        const scaleFactor = await win.scaleFactor();
        const MIN_LOGICAL_WIDTH = 340; // updated minimum width
        const minPhysicalWidth = Math.round(MIN_LOGICAL_WIDTH * scaleFactor);
        if (saved.width < minPhysicalWidth) {
          const deficit = minPhysicalWidth - saved.width;
          saved.x = Math.max(0, saved.x - deficit);
          saved.width = minPhysicalWidth;
          saveWidgetPosition(saved);
        }

        await win.setPosition(new PhysicalPosition(saved.x, saved.y));
        await win.setSize(new PhysicalSize(saved.width, saved.height));

        const unlistenMove = await win.onMoved(async (pos) => {
          if (cleanup) return;
          const size = await win.innerSize();
          saveWidgetPosition({
            x: pos.payload.x,
            y: pos.payload.y,
            width: size.width,
            height: size.height,
          });
        });

        const unlistenResize = await win.onResized(async (size) => {
          if (cleanup) return;
          const pos = await win.outerPosition();
          saveWidgetPosition({
            x: pos.x,
            y: pos.y,
            width: size.payload.width,
            height: size.payload.height,
          });
        });

        return () => {
          cleanup = true;
          unlistenMove();
          unlistenResize();
        };
      } catch {
        // Not in Tauri
      }
    }

    initPosition();
  }, []);

  useEffect(() => {
    invoke('embed_widget_in_desktop').catch((e) => {
      console.warn('Widget pin failed:', e);
    });
  }, []);

  if (loading) {
    return (
      <div className="widget-app widget-app--loading">
        <span className="t-meta">LOADING...</span>
      </div>
    );
  }

  return (
    <div
      className={`widget-app ${isFrozen ? 'widget-app--frozen' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={wallpaperUrl ? {
        backgroundImage: `url(${wallpaperUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: `${cropX}% ${cropY}%`,
      } : undefined}
    >
      {wallpaperUrl && (
        <div
          className="widget-app__dim-overlay"
          style={{ 
            backgroundColor: `rgba(0, 0, 0, ${dimIntensity})`,
            backdropFilter: blurIntensity > 0 ? `blur(${blurIntensity}px)` : 'none',
            WebkitBackdropFilter: blurIntensity > 0 ? `blur(${blurIntensity}px)` : 'none',
          }}
        />
      )}

      <div className="widget-app__content">
        <div className="widget-app__left-panel">
          <div className="widget-app__left-progress">
            <ProgressCircle 
              completedCount={completedCount}
              totalScheduled={totalScheduled}
              tiny
            />
          </div>
          <div style={{ flex: 1, marginTop: '80px', width: '40px', display: 'flex', flexDirection: 'column' }}>
            <SleepTube 
              isWidget
              settings={userDoc?.settings ? {
                wakeUpTime: userDoc.settings.wakeUpTime || "07:00",
                bedTime: userDoc.settings.bedTime || "23:00"
              } : undefined} 
            />
          </div>
        </div>

        <div className="widget-app__right-panel">
          <div className="widget-app__header">
            <div className="widget-app__header-left">
              <span className="widget-app__logo">[ W ]</span>
              <span className="widget-app__protocols-title">[ ACTIVE PROTOCOLS ]</span>
            </div>
          </div>

          <div className="widget-app__habits-scroll">
            <WidgetHabitList
              today={today}
              scheduledHabits={scheduledHabits}
              todayLog={todayLog}
              periodLogs={periodLogs}
              weeklyResetDay={userDoc?.settings?.weeklyResetDay ?? 1}
              onComplete={completeHabit}
              onUndo={undoHabit}
            />
          </div>

          <div className="widget-app__stats-section">
            <StatsDeck
              completedCount={completedCount}
              totalScheduled={totalScheduled}
              strikeCount={strikeCount}
            />
          </div>

          <div className="widget-app__clock-container">
            <span className="widget-app__clock t-data">{timeString}</span>
          </div>
        </div>
      </div>

      {isLocked && (
        <div className="widget-app__lockout" onClick={async () => {
          try {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const main = await WebviewWindow.getByLabel('main');
            if (main) {
              await main.show();
              await main.setFocus();
            }
          } catch {}
        }}>
          <ShieldAlert size={32} />
          <span className="t-label">[ LOCKED — OPEN APP ]</span>
        </div>
      )}
    </div>
  );
}
