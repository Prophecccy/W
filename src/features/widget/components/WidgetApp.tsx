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
import './WidgetApp.css';

export function WidgetApp() {
  const {
    todayLog,
    userDoc,
    loading,
    scheduledHabits,
    completedCount,
    totalScheduled,
    globalStreak,
    weeklyCompletions,
    completeHabit,
    undoHabit,
  } = useWidgetData();

  const strikeCount = userDoc?.strikes?.current ?? 0;
  const isLocked = strikeCount >= 5;
  const isFrozen = userDoc?.freeze?.active === true;

  // ─── Manual Drag State ───────────────────────────────────
  // ALL drag handlers are synchronous — no awaits allowed in the drag path.
  // The actual window move is handled natively by Rust (move_widget_by).
  const isDragging = useRef(false);
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
    lastPos.current = { x: e.screenX, y: e.screenY };
    // MUST be called synchronously — captures pointer even outside window bounds
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;

    const dx = Math.round(e.screenX - lastPos.current.x);
    const dy = Math.round(e.screenY - lastPos.current.y);
    if (dx === 0 && dy === 0) return;

    lastPos.current = { x: e.screenX, y: e.screenY };
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
  const accentColor = userDoc?.aesthetics?.widget?.accentColor ?? userDoc?.aesthetics?.desktop?.accentColor ?? '#5B8DEF';

  // Apply accent color to widget
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor);
  }, [accentColor]);

  // ─── Restore & persist widget position ───────────────────
  useEffect(() => {
    let cleanup = false;

    async function initPosition() {
      try {
        const win = getCurrentWindow();
        const saved = await loadWidgetPosition();

        // Restore position using Physical coordinate metrics to prevent runaway DPI growth
        await win.setPosition(new PhysicalPosition(saved.x, saved.y));
        await win.setSize(new PhysicalSize(saved.width, saved.height));

        // Listen for move/resize events to persist
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
        // Not in Tauri (browser dev)
      }
    }

    initPosition();
  }, []);

  // ─── Pin widget to bottom z-order on mount ───────────────
  useEffect(() => {
    invoke('embed_widget_in_desktop').catch((e) => {
      console.warn('Widget pin failed:', e);
    });
  }, []);

  // ─── Render ──────────────────────────────────────────────
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
        backgroundPosition: 'center',
      } : undefined}
    >
      {/* Wallpaper dim overlay */}
      {wallpaperUrl && (
        <div
          className="widget-app__dim-overlay"
          style={{ opacity: dimIntensity }}
        />
      )}

      {/* Main content */}
      <div className="widget-app__content">
        <div className="widget-app__layout-with-tube">
          <div className="widget-tube-container">
            <TimeTubeSimple 
              wakeUpTime={userDoc?.settings?.wakeUpTime || "07:00"}
              bedTime={userDoc?.settings?.bedTime || "23:00"}
              accentColor={userDoc?.settings?.accentColor || "#bb86fc"}
            />
          </div>
          
          <div className="widget-app__main-column">
            <PowerHub
              completedCount={completedCount}
              totalScheduled={totalScheduled}
              globalStreak={globalStreak}
              strikeCount={strikeCount}
              weeklyCompletions={weeklyCompletions}
              isFrozen={isFrozen}
            />

            <div className="widget-app__habits-scroll">
              <WidgetHabitList
                scheduledHabits={scheduledHabits}
                todayLog={todayLog}
                onComplete={completeHabit}
                onUndo={undoHabit}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Lockout Overlay */}
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
