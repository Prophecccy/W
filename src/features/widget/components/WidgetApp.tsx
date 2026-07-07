import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useWidgetData } from '../hooks/useWidgetData';
import { StatsDeck } from './StatsDeck/StatsDeck';
import { WidgetHabitList } from './HabitList/WidgetHabitList';
import { loadWidgetPosition, saveWidgetPosition, flushWidgetPosition } from '../services/widgetPositionStore';
import { ShieldAlert } from 'lucide-react';
import { getLocalWallpaper } from '../../../shared/utils/storageUtils';
import { isTauri } from '../../../shared/utils/tauri';
import { SleepTube } from '../../dashboard/components/SleepTube';
import { ProgressCircle } from '../../../shared/components/ProgressCircle/ProgressCircle';
import { syncActiveLockdownState } from '../../lockdown/services/lockdownService';
import { processGap } from '../../strikes/services/gapProcessor';
import './WidgetApp.css';

async function safeInvoke(cmd: string, args?: any) {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke(cmd, args);
    } catch (e) {
      console.error(`safeInvoke failed for ${cmd}:`, e);
    }
  }
}

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
    habits,
    globalStreak,
    weeklyCompletions,
  } = useWidgetData();

  const strikeCount = userDoc?.strikes?.current ?? 0;
  const isLocked = strikeCount >= 5;
  const isFrozen = userDoc?.freeze?.active === true;

  // ─── Real-Time Clock ─────────────────────────────────────
  const [timeString, setTimeString] = useState('');
  const [isPositionInitialized, setIsPositionInitialized] = useState(false);
  const userManualHeightRef = useRef<number | null>(null);
  const isAutoResizingRef = useRef(false);



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

  // ─── Background Lockdown Scheduler ─────────────────────────
  useEffect(() => {
    if (loading || !userDoc?.uid) return;

    // Run sync immediately
    syncActiveLockdownState(userDoc.uid);

    // Run sync every 15 seconds
    const interval = setInterval(() => {
      syncActiveLockdownState(userDoc.uid);
    }, 15000);

    return () => clearInterval(interval);
  }, [loading, userDoc?.uid]);

  // ─── Background Gap/Strikes Processor ──────────────────────
  const gapProcessorStarted = useRef(false);
  useEffect(() => {
    if (loading || !userDoc?.uid || !userDoc?.lastActiveDate) return;

    const lastActive = userDoc.lastActiveDate;
    if (lastActive < today && !gapProcessorStarted.current) {
      gapProcessorStarted.current = true;
      console.log(`[Widget] Detected gap (lastActiveDate: ${lastActive}, today: ${today}). Running gap processor...`);
      
      processGap(lastActive, today)
        .then((result) => {
          console.log('[Widget] Gap processor completed:', result);
          gapProcessorStarted.current = false;
        })
        .catch((err) => {
          console.error('[Widget] Gap processor failed:', err);
          gapProcessorStarted.current = false;
        });
    }
  }, [loading, userDoc?.uid, userDoc?.lastActiveDate, today]);

  // ── Z-Order Enforcer: Active Defense ───────────────────────
  useEffect(() => {
    let active = true;
    let unsubPromise: Promise<() => void> | null = null;
    async function setupZOrderDefense() {
      try {
        const { getCurrentWebviewWindow, WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
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
            try { await safeInvoke("pin_widget_bottom"); } catch {}
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
  const lastMonitorNameRef = useRef<string | null>(null);
  const currentSizeRef = useRef({ width: 400, height: 580 });

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

    if (isTauri()) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        getCurrentWindow().startDragging();
      }).catch(() => {});
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    // ── Z-Order Enforcer: only on TAP (no drag movement) ──
    // Since startDragging intercepts mouse events during native drag,
    // this handler is only reached on simple clicks/taps.
    try {
      safeInvoke("pin_widget_bottom");
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
  }, []);

  // ─── Wallpaper ───────────────────────────────────────────
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [previewDim, setPreviewDim] = useState<number | null>(null);
  const [previewBlur, setPreviewBlur] = useState<number | null>(null);

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
      } else if (e.data.type === 'WIDGET_AESTHETICS_PREVIEW') {
        setPreviewDim(e.data.dimIntensity);
        setPreviewBlur(e.data.blurIntensity);
      } else if (e.data.type === 'CLEAR_AESTHETICS_PREVIEW') {
        setPreviewDim(null);
        setPreviewBlur(null);
      }
    };
    
    window.addEventListener("wallpaper-changed", applyWallpaper);
    return () => {
      channel.close();
      window.removeEventListener("wallpaper-changed", applyWallpaper);
    };
  }, []);
  const dimIntensity = previewDim !== null ? previewDim : (userDoc?.aesthetics?.widget?.dimIntensity ?? 0.7);
  const blurIntensity = previewBlur !== null ? previewBlur : (userDoc?.aesthetics?.widget?.blurIntensity ?? 0);
  const accentColor = userDoc?.aesthetics?.widget?.accentColor ?? userDoc?.aesthetics?.desktop?.accentColor ?? '#5B8DEF';
  const cropX = userDoc?.aesthetics?.widget?.cropX ?? 50;
  const cropY = userDoc?.aesthetics?.widget?.cropY ?? 50;

  // Apply accent color to widget
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor);
    const parsedRgb = parseColorToRgb(accentColor);
    if (parsedRgb) {
      document.documentElement.style.setProperty('--accent-rgb', parsedRgb);
    }
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
          const color = event.payload;
          document.documentElement.style.setProperty('--accent', color);
          const parsedRgb = parseColorToRgb(color);
          if (parsedRgb) {
            document.documentElement.style.setProperty('--accent-rgb', parsedRgb);
          }
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

    const allHabits = [...scheduledHabits, ...scheduledLimiters];
    allHabits.forEach(habit => {
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
  }, [scheduledHabits, scheduledLimiters, todayLog, heightTrigger]);

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
  }, [scheduledHabits, scheduledLimiters, habits, todayLog, periodLogs, today, userDoc?.settings?.weeklyResetDay, heightTrigger]);

  // ─── Auto-resize window height to fit habit count ─────────
  useEffect(() => {
    async function resizeToContent() {
      if (!isPositionInitialized) return;
      if (userManualHeightRef.current !== null) return; // Respect manual resize adjustments
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { PhysicalSize } = await import("@tauri-apps/api/dpi");
        const win = getCurrentWindow() as any;
        const scaleFactor = await win.scaleFactor();
        const targetPhysical = Math.round(targetLogicalHeight * scaleFactor);

        const currentSize = await win.innerSize();
        if (Math.abs(currentSize.height - targetPhysical) > 2) {
          isAutoResizingRef.current = true;
          await win.setSize(new PhysicalSize(currentSize.width, targetPhysical));
          isAutoResizingRef.current = false;

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
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");
        const win = getCurrentWindow() as any;
        const saved = await loadWidgetPosition();
        currentSizeRef.current = { width: saved.width, height: saved.height };

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
          const { availableMonitors } = await import("@tauri-apps/api/window");
          const monitors = await availableMonitors();
          let isOnAnyScreen = false;

          for (const m of monitors) {
            const mX = m.position.x;
            const mY = m.position.y;
            const mW = m.size.width;
            const mH = m.size.height;

            if (saved.x >= mX && saved.x < (mX + mW - 100) &&
                saved.y >= mY && saved.y < (mY + mH - 100)) {
              isOnAnyScreen = true;
              break;
            }
          }

          if (!isOnAnyScreen && monitors.length > 0) {
            console.warn("[Widget Monitor Guard] Off-screen detected! Resetting position to center-right safe bounds.");
            const primary = monitors[0];
            saved.x = Math.max(100, primary.position.x + primary.size.width - saved.width - 100);
            saved.y = Math.max(100, primary.position.y + 100);
            saveWidgetPosition(saved);
          }
        } catch (e) {
          console.warn("[Widget Monitor Guard] Monitor fetch failed:", e);
        }

        const currentMon = await win.currentMonitor();
        if (currentMon) {
          lastMonitorNameRef.current = currentMon.name;
        }

        await win.setPosition(new PhysicalPosition(saved.x, saved.y));
        await win.setSize(new PhysicalSize(saved.width, saved.height));

        setIsPositionInitialized(true);

        let throttleTimer: any = null;
        const lastPendingPositionRef = { x: saved.x, y: saved.y };

        const unlistenM = await win.onMoved(async (pos: any) => {
          if (cleanup) return;

          lastPendingPositionRef.x = pos.payload.x;
          lastPendingPositionRef.y = pos.payload.y;

          if (throttleTimer) return;

          throttleTimer = setTimeout(async () => {
            throttleTimer = null;
            if (cleanup) return;

            const targetX = lastPendingPositionRef.x;
            const targetY = lastPendingPositionRef.y;

            saveWidgetPosition({
              x: targetX,
              y: targetY,
              width: currentSizeRef.current.width,
              height: currentSizeRef.current.height,
            });

            try {
              const monitor = await win.currentMonitor();
              if (monitor && lastMonitorNameRef.current && monitor.name !== lastMonitorNameRef.current) {
                console.log(`[WidgetApp] Monitor changed from ${lastMonitorNameRef.current} to ${monitor.name}. Flushing and reloading...`);
                lastMonitorNameRef.current = monitor.name;
                await flushWidgetPosition();
                window.location.reload();
                return;
              } else if (monitor && !lastMonitorNameRef.current) {
                lastMonitorNameRef.current = monitor.name;
              }
            } catch (err) {
              console.warn("[WidgetApp] Failed to check monitor onMoved:", err);
            }
          }, 200); // 200ms throttle
        });

        const unlistenR = await win.onResized(async (size: any) => {
          if (cleanup) return;
          if (isAutoResizingRef.current) return; // Skip if resized by auto-resizer

          // User manually resized: record manual height and save config
          userManualHeightRef.current = size.payload.height;
          currentSizeRef.current = { width: size.payload.width, height: size.payload.height };

          const pos = await win.outerPosition();
          saveWidgetPosition({
            x: pos.x,
            y: pos.y,
            width: size.payload.width,
            height: size.payload.height,
          });
        });

        const unlistenS = await win.onScaleChanged(async () => {
          if (cleanup) return;
          console.log("[WidgetApp] Scale factor changed. Reloading...");
          window.location.reload();
        });

        return [unlistenM, unlistenR, unlistenS];
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
    safeInvoke('embed_widget_in_desktop').catch((e) => {
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

  const handleCreateTodoClick = useCallback(async (e: React.PointerEvent) => {
    e.stopPropagation(); // Prevent widget drag behavior on button press
    console.log("Widget: handleCreateTodoClick triggered!");
    try {
       const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

       const todoCreator = await WebviewWindow.getByLabel("todo-creator");
       console.log("Widget: Found todoCreator by label:", todoCreator);
       if (todoCreator) {
         console.log("Widget: Showing existing todoCreator window...");
         const resShow = await todoCreator.show();
         console.log("Widget: show() result:", resShow);
         const resFocus = await todoCreator.setFocus();
         console.log("Widget: setFocus() result:", resFocus);
       } else {
         console.log("Widget: todoCreator not found, instantiating new WebviewWindow...");
         const newTodoCreator = new WebviewWindow("todo-creator", {
           url: "/todo-creator",
           decorations: false,
           transparent: true,
           center: true,
           width: 640,
           height: 560,
           resizable: false,
           alwaysOnTop: true,
           skipTaskbar: true,
           title: "Todo Creator",
           visible: false,
         });
         console.log("Widget: newTodoCreator created:", newTodoCreator);
       }
    } catch (err) {
       console.error("Failed to trigger new todo from widget:", err);
    }
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
      onPointerUp={handlePointerUp}
      style={wallpaperUrl ? {
        backgroundImage: `url(${wallpaperUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: `${cropX}% ${cropY}%`,
        backgroundColor: 'transparent',
      } : {
        backgroundColor: '#000000',
      }}
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
            <button
              className="widget-app__add-todo t-meta"
              onPointerDown={handleCreateTodoClick}
            >
              [ + TODO ]
            </button>
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
              isFrozen={isFrozen}
            />
          </div>

          <div className="widget-app__stats-section">
            <StatsDeck
              completedCount={completedCount}
              totalScheduled={totalScheduled}
              strikeCount={strikeCount}
              globalStreak={globalStreak}
              weeklyCompletions={weeklyCompletions}
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
                url: '/',
                decorations: false,
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
  if (isNaN(d.getTime())) return dateStr;
  let safety = 0;
  while (d.getDay() !== weekStartDay && safety < 10) {
    d.setDate(d.getDate() - 1);
    safety++;
  }
  return formatDate(d);
}

function getMonthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

function getIntervalStart(habit: any, todayStr: string): string {
  if (habit.period !== "interval" || habit.intervalDays <= 0) return todayStr;
  const created = new Date(habit.createdAt);
  created.setHours(12, 0, 0, 0);
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

function parseColorToRgb(color: string): string | null {
  if (!color) return null;
  const trimmed = color.trim().toLowerCase();
  
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return !isNaN(r) && !isNaN(g) && !isNaN(b) ? `${r}, ${g}, ${b}` : null;
    } else if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return !isNaN(r) && !isNaN(g) && !isNaN(b) ? `${r}, ${g}, ${b}` : null;
    }
  }

  if (trimmed.startsWith('rgb')) {
    const matches = trimmed.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (matches && matches.length >= 4) {
      return `${matches[1]}, ${matches[2]}, ${matches[3]}`;
    }
  }

  if (trimmed.startsWith('hsl')) {
    const matches = trimmed.match(/hsla?\((\d+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
    if (matches && matches.length >= 4) {
      const h = parseInt(matches[1], 10) / 360;
      const s = parseFloat(matches[2]) / 100;
      const l = parseFloat(matches[3]) / 100;
      
      let r = l, g = l, b = l;
      if (s !== 0) {
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      return `${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}`;
    }
  }

  return null;
}
