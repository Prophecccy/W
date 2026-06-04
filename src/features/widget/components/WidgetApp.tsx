import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useWidgetData } from '../hooks/useWidgetData';
import { StatsDeck } from './StatsDeck/StatsDeck';
import { WidgetHabitList } from './HabitList/WidgetHabitList';
import { loadWidgetPosition, saveWidgetPosition, flushWidgetPosition } from '../services/widgetPositionStore';
import { ShieldAlert } from 'lucide-react';
import { getLocalWallpaper } from '../../../shared/utils/storageUtils';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
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
    scheduledLimiters,
    completeHabit,
    undoHabit,
  } = useWidgetData();

  const strikeCount = userDoc?.strikes?.current ?? 0;
  const isLocked = strikeCount >= 5;
  const isFrozen = userDoc?.freeze?.active === true;

  // ─── Real-Time Clock ─────────────────────────────────────
  const [timeString, setTimeString] = useState('');
  const [isPositionInitialized, setIsPositionInitialized] = useState(false);

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
    let active = true;
    let unsubPromise: Promise<() => void> | null = null;
    async function setupZOrderDefense() {
      try {
        const { getCurrentWebviewWindow, WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const { invoke } = await import("@tauri-apps/api/core");
        const currentWin = getCurrentWebviewWindow();
        const unsub = await currentWin.onFocusChanged(async ({ payload: focused }) => {
          if (!active) return;
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
        return unsub;
      } catch { /* Not in Tauri */ }
      return () => {};
    }
    unsubPromise = setupZOrderDefense();
    return () => {
      active = false;
      if (unsubPromise) {
        unsubPromise.then((unsub) => unsub()).catch(() => {});
      }
    };
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

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const wasDrag = dragMoved.current;
    isDragging.current = false;
    dragMoved.current = false;

    if (wasDrag) {
      // ── Flush position immediately on drag-end ──
      // The debounced save may never fire if the app is closed soon after.
      getCurrentWindow().outerPosition().then(pos => {
        getCurrentWindow().innerSize().then(size => {
          flushWidgetPosition({ x: pos.x, y: pos.y, width: size.width, height: size.height });
        });
      }).catch(() => {});
    } else {
      // ── Z-Order Enforcer: only on TAP (no drag movement) ──
      // During a drag we must NOT steal focus or re-pin, otherwise
      // the window gets sent behind other windows mid-move.
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
  }, [accentColor]);

  // Listen for live preview from main settings window on mount (single listener to avoid leaks)
  useEffect(() => {
    let active = true;
    let unsubPromise: Promise<() => void> | null = null;

    const setupListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        if (!active) return () => {};
        const unlisten = await listen<string>('color-preview', (event) => {
          if (!active) return;
          document.documentElement.style.setProperty('--accent', event.payload);
        });
        return unlisten;
      } catch {
        return () => {};
      }
    };
    unsubPromise = setupListener();

    return () => {
      active = false;
      if (unsubPromise) {
        unsubPromise.then((unsub) => unsub()).catch(() => {});
      }
    };
  }, []);

  // Trigger a re-render to recalculate widget height when active undo windows expire
  const [heightTrigger, setHeightTrigger] = useState(0);
  useEffect(() => {
    let active = true;
    let minRemaining = Infinity;

    scheduledHabits.forEach(habit => {
      const entry = todayLog?.habits?.[habit.id];
      const completions = entry?.completions || [];
      if (completions.length > 0) {
        const latest = completions[completions.length - 1];
        const ageMs = Date.now() - latest.timestamp;
        if (ageMs < 8000) {
          const remaining = 8000 - ageMs;
          if (remaining < minRemaining) minRemaining = remaining;
        }
      }
    });

    if (minRemaining !== Infinity && minRemaining > 0) {
      const timer = setTimeout(() => {
        if (active) setHeightTrigger(prev => prev + 1);
      }, minRemaining);
      return () => clearTimeout(timer);
    }
  }, [scheduledHabits, todayLog, heightTrigger]);

  // ─── Precise height memoization for auto-scaling ──────────
  const targetLogicalHeight = useMemo(() => {
    // CSS Pixel-Matched Metrics
    const HEADER_H     = 34;  // .widget-app__header height + padding
    const PANEL_GAP    = 12;  // .widget-app__right-panel gaps
    const STATS_DECK_H = 80;  // Actual height of stats deck
    const CLOCK_H      = 72;  // .widget-app__clock-container height (enlarged clock)
    const INSET        = 48;  // Window absolute offset (16px) + content padding (32px)
    const EMPTY_H      = 60;  // Height of empty habits state
    const CARD_GAP     = 12;  // Card margin-bottom

    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;

    // Helper to calculate total value logged in a period
    const getTotalInRange = (habitId: string, startDate: string) => {
      let total = 0;
      for (const log of periodLogs) {
        if (log.date < startDate) continue;
        total += log.habits?.[habitId]?.value ?? 0;
      }
      return total;
    };

    // Helper to calculate height of a single habit card
    const getHabitCardHeight = (habit: any) => {
      let cardHeight = 52; // Default height

      const entry = todayLog?.habits?.[habit.id];
      const completions = entry?.completions || [];
      
      let justCompleted = false;
      if (completions.length > 0) {
        const latest = completions[completions.length - 1];
        const ageMs = Date.now() - latest.timestamp;
        if (ageMs < 8000) justCompleted = true;
      }

      const interactedToday = completions.length > 0 || (entry?.value ?? 0) > 0;

      if (isMultiDayMetric(habit)) {
        const target = habit.metric?.targetValue ?? 0;
        const start = getPeriodStart(habit, today, weeklyResetDay);
        const periodCompleted = target > 0 ? getTotalInRange(habit.id, start) >= target : false;
        
        // If interacted today but period is not fully completed, show "✓ DONE TODAY" second line (+15px)
        const isCompletedToday = periodCompleted;
        const doneToday = interactedToday && !periodCompleted;
        const isCompleted = isCompletedToday || justCompleted;
        const isDoneToday = doneToday && !isCompleted;

        if (isDoneToday) {
          cardHeight += 15;
        }
      }
      return cardHeight;
    };

    let habitAreaHeight = 0;
    const n = scheduledHabits.length;
    if (n > 0) {
      scheduledHabits.forEach(habit => {
        habitAreaHeight += getHabitCardHeight(habit) + CARD_GAP;
      });
    } else {
      habitAreaHeight += EMPTY_H;
    }

    if (scheduledLimiters && scheduledLimiters.length > 0) {
      habitAreaHeight += 24; // Section Title "[ LIMITERS ]" + margin
      scheduledLimiters.forEach(habit => {
        habitAreaHeight += getHabitCardHeight(habit) + CARD_GAP;
      });
    }

    // Calculate Right Panel: 4 components with 3 vertical gaps
    const targetLogicalRightPanel = HEADER_H + habitAreaHeight + STATS_DECK_H + CLOCK_H + (3 * PANEL_GAP);
    
    // Left Panel: Progress circle (40px) + margin (12px) + SleepTube container (200px)
    const targetLogicalLeftPanel = 252;

    // Outer window logical height is the maximum panel height + vertical padding/inset
    const targetLogical = Math.max(targetLogicalRightPanel, targetLogicalLeftPanel) + INSET;
    
    // Apply an additional 24px rendering safety buffer
    const targetLogicalWithBuffer = targetLogical + 24;

    return Math.max(300, Math.min(800, targetLogicalWithBuffer));
  }, [scheduledHabits, todayLog, periodLogs, today, userDoc?.settings?.weeklyResetDay, heightTrigger]);

  // ─── Auto-resize window height to fit habit count ─────────
  useEffect(() => {
    async function resizeToContent() {
      if (!isPositionInitialized) return;
      try {
        const win = getCurrentWindow();
        const scaleFactor = await win.scaleFactor();
        const targetPhysical = Math.round(targetLogicalHeight * scaleFactor);

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

    if (!loading && isPositionInitialized) {
      resizeToContent();
    }
  }, [targetLogicalHeight, loading, isPositionInitialized]);

  // ─── Restore & persist widget position ───────────────────
  useEffect(() => {
    let cleanup = false;
    let unsubsPromise: Promise<(() => void)[]> | null = null;

    async function initPosition() {
      try {
        const win = getCurrentWindow() as any;
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

        // Monitor Boundaries Guard (clamping offscreen windows)
        try {
          const monitor = await win.currentMonitor();
          if (monitor) {
            const monitorWidth = monitor.size.width;
            const monitorHeight = monitor.size.height;
            const monitorX = monitor.position.x;
            const monitorY = monitor.position.y;

            // Clamping check
            const isOffScreenX = saved.x < monitorX || saved.x > (monitorX + monitorWidth - 100);
            const isOffScreenY = saved.y < monitorY || saved.y > (monitorY + monitorHeight - 100);

            if (isOffScreenX || isOffScreenY) {
              console.warn("[Widget Monitor Guard] Off-screen detected! Resetting position to center-right safe bounds.");
              saved.x = Math.max(100, monitorX + monitorWidth - saved.width - 100);
              saved.y = Math.max(100, monitorY + 100);
              saveWidgetPosition(saved);
            }
          }
        } catch (e) {
          console.warn("[Widget Monitor Guard] Monitor fetch failed:", e);
        }

        await win.setPosition(new PhysicalPosition(saved.x, saved.y));
        await win.setSize(new PhysicalSize(saved.width, saved.height));

        setIsPositionInitialized(true);

        const unlistenM = await win.onMoved(async (pos: any) => {
          if (cleanup) return;
          const size = await win.innerSize();
          saveWidgetPosition({
            x: pos.payload.x,
            y: pos.payload.y,
            width: size.width,
            height: size.height,
          });
        });

        const unlistenR = await win.onResized(async (size: any) => {
          if (cleanup) return;
          const pos = await win.outerPosition();
          saveWidgetPosition({
            x: pos.x,
            y: pos.y,
            width: size.payload.width,
            height: size.payload.height,
          });
        });

        return [unlistenM, unlistenR];
      } catch {
        setIsPositionInitialized(true);
        return [];
      }
    }

    unsubsPromise = initPosition();

    return () => {
      cleanup = true;
      if (unsubsPromise) {
        unsubsPromise.then((unsubs) => unsubs.forEach((unsub) => unsub())).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    invoke('embed_widget_in_desktop').catch((e) => {
      console.warn('Widget pin failed:', e);
    });
  }, []);

  // ─── Flush position to disk before process death ────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Grab current window position and flush synchronously-ish.
      // We use the pending position tracked inside the store module
      // so we don't need an async call that can't complete in time.
      flushWidgetPosition();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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
      onLostPointerCapture={handlePointerUp}
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

      <div className="widget-app__content" inert={isLocked ? true : undefined}>
        <div className="widget-app__left-panel">
          <div className="widget-app__left-progress">
            <ProgressCircle 
              completedCount={completedCount}
              totalScheduled={totalScheduled}
              tiny
            />
          </div>
          <div style={{ flex: 1, marginTop: '48px', marginBottom: '64px', width: '40px', display: 'flex', flexDirection: 'column' }}>
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
              scheduledLimiters={scheduledLimiters}
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
            } else {
              // Recreate the main window if it has been closed
              const newMain = new WebviewWindow('main', {
                url: 'index.html',
                title: 'W Command Center',
                width: 1024,
                height: 768,
                minWidth: 800,
                minHeight: 600,
              });
              await newMain.show();
              await newMain.setFocus();
            }
          } catch (e) {
            console.error('Failed to restore or recreate main window:', e);
          }
        }}>
          <ShieldAlert size={32} />
          <span className="t-label">[ LOCKED — OPEN APP ]</span>
        </div>
      )}
    </div>
  );
}

// ─── Precise Height Helper Functions ─────────────────────────
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStart(dateStr: string, weekStartDay: number): string {
  const d = new Date(dateStr + "T12:00:00");
  while (d.getDay() !== weekStartDay) {
    d.setDate(d.getDate() - 1);
  }
  return formatDate(d);
}

function getMonthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

function getIntervalStart(habit: any, todayStr: string): string {
  if (habit.period !== "interval" || habit.intervalDays <= 0) return todayStr;
  const created = new Date(habit.createdAt);
  const today = new Date(todayStr + "T12:00:00");
  const diffDays = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return formatDate(created);
  const segmentStart = diffDays - (diffDays % habit.intervalDays);
  created.setDate(created.getDate() + segmentStart);
  return formatDate(created);
}

function getPeriodStart(habit: any, todayStr: string, weekStartDay: number): string {
  if (habit.period === "weekly") return getWeekStart(todayStr, weekStartDay);
  if (habit.period === "monthly") return getMonthStart(todayStr);
  if (habit.period === "interval") return getIntervalStart(habit, todayStr);
  return todayStr;
}

function isMultiDayMetric(habit: any): boolean {
  return (habit.type === "metric" || habit.type === "limiter") && (habit.period === "weekly" || habit.period === "monthly" || habit.period === "interval");
}
