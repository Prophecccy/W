import { useEffect } from 'react';
import { useWidgetData } from '../hooks/useWidgetData';
import { PowerHub } from './PowerHub/PowerHub';
import { WidgetHabitList } from './HabitList/WidgetHabitList';
import { loadWidgetPosition, saveWidgetPosition } from '../services/widgetPositionStore';
import { ShieldAlert } from 'lucide-react';
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

  // Wallpaper
  const wallpaperUrl = userDoc?.wallpapers?.widget ?? null;
  const dimIntensity = userDoc?.aesthetics?.widget?.dimIntensity ?? 0.7;
  const accentColor = userDoc?.aesthetics?.widget?.accentColor ?? userDoc?.aesthetics?.desktop?.accentColor ?? '#5B8DEF';

  // Apply accent color to widget
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor);
  }, [accentColor]);

  // Restore and track widget position
  useEffect(() => {
    let cleanup = false;

    async function initPosition() {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const saved = await loadWidgetPosition();

        // Restore position
        const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi');
        await win.setPosition(new LogicalPosition(saved.x, saved.y));
        await win.setSize(new LogicalSize(saved.width, saved.height));

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

  // Try to embed in WorkerW on mount
  useEffect(() => {
    async function embed() {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('embed_widget_in_desktop');
        console.info('Widget embedded in WorkerW desktop layer');
      } catch (e) {
        console.warn('WorkerW embedding failed, using fallback:', e);
        // Fallback: just keep the window visible as-is
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const win = getCurrentWindow();
          await win.show();
        } catch {}
      }
    }
    embed();
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
