import { useEffect, useState, useRef, useCallback } from 'react';
import { useWidgetData } from '../hooks/useWidgetData';
import { PowerHub } from './PowerHub/PowerHub';
import { WidgetHabitList } from './HabitList/WidgetHabitList';
import { TimeTubeSimple } from '../../time-tube/components/TimeTubeSimple/TimeTubeSimple';
import { loadWidgetPosition, saveWidgetPosition } from '../services/widgetPositionStore';
import { ShieldAlert } from 'lucide-react';
import { getLocalWallpaper } from '../../../shared/utils/storageUtils';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './WidgetApp.css';

export function WidgetApp() {
  const {
    todayLog,
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
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // ── Z-Order Enforcer: Active Defense on Click ──
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

    // Store absolute physical position plus offset to prevent fractional drift over time
    lastPos.current = { x: lastPos.current.x + dx, y: lastPos.current.y + dy };
    // Fire-and-forget — Rust handles the native move synchronously
    invoke('move_widget_by', { dx, dy });
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
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

        const POWERHUB_H = 160;
        const CARD_H     = 50;
        const CARD_GAP   = 8;
        const TOP_HEADER = 32;
        const INSET      = 16;

        const EMPTY_H    = 60;

        const n = scheduledHabits.length;
        const habitArea = n > 0
          ? TOP_HEADER + (n * CARD_H) + (n * CARD_GAP)
          : TOP_HEADER + EMPTY_H;

        const targetLogical = INSET + POWERHUB_H + habitArea;
        const clamped = Math.max(300, Math.min(800, targetLogical));
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
        <div className="widget-app__top-section">
          <div className="widget-app__habits-area">
            <div className="widget-app__header">
              <span>[ ACTIVE PROTOCOLS ]</span>
              <span className="text-blue" style={{ marginRight: '16px' }}>SYSTEM LIVE</span>
            </div>
            <div className="widget-app__habits-scroll">
              <WidgetHabitList
                scheduledHabits={scheduledHabits}
                todayLog={todayLog}
                onComplete={completeHabit}
                onUndo={undoHabit}
              />
            </div>
          </div>
          
          <div className="widget-app__tube-area">
            <TimeTubeSimple
              wakeUpTime={userDoc?.settings?.wakeUpTime || "07:00"}
              bedTime={userDoc?.settings?.bedTime || "23:00"}
              accentColor={accentColor}
            />
          </div>
        </div>

        <div className="widget-app__bottom-section">
          <PowerHub
            completedCount={completedCount}
            totalScheduled={totalScheduled}

          />
        </div>
        
        <div className="widget-app__footer">
          <div className={`widget-app__strike-badge ${strikeCount > 0 ? 'widget-app__strike-badge--active' : ''}`}>
            {strikeCount > 0 ? `[ ${strikeCount} STRIKES ]` : '[ 0 STRIKES ]'}
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
