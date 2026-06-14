import { useState, useCallback, useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "../shared/components/Sidebar/Sidebar";
import { Topbar } from "../shared/components/Topbar/Topbar";
import { CommandPalette } from "../shared/components/CommandPalette/CommandPalette";
import { LockoutOverlay } from "../features/strikes/components/LockoutOverlay";
import { PunishmentModal } from "../features/strikes/components/PunishmentModal";
import { StrikeWarningToast } from "../features/strikes/components/StrikeWarningToast";
import { WelcomeBack } from "../features/freeze/components/WelcomeBack";
import { useStrikes } from "../features/strikes/hooks/useStrikes";
import { applyPunishment } from "../features/strikes/services/punishmentService";
import { processGap, GapProcessorResult } from "../features/strikes/services/gapProcessor";
import { PunishmentChoice } from "../features/strikes/types";
import { useKeyboardShortcuts } from "../shared/hooks/useKeyboardShortcuts";

import { useAuthContext } from "../features/auth/context";
import { OnboardingFlow } from "../features/auth/components/OnboardingFlow";
import { UserProvider, useUserStore } from "../shared/stores/userStore";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../shared/config/firebase";
import { User } from "../shared/types";
import { Habit } from "../features/habits/types";
import { Todo } from "../features/todos/types";
import { getHabits } from "../features/habits/services/habitService";

import { completeHabit } from "../features/habits/services/logService";
import { getToday, getMsUntilBackup } from "../shared/utils/dateUtils";
import { useNotifications } from "../shared/hooks/useNotifications";
import { getLocalWallpaper } from "../shared/utils/storageUtils";
import { UpdateHUD } from "../features/updater/components/UpdateHUD";
import { initUpdater } from "../features/updater/hooks/useUpdateManager";
import { useToast } from "../shared/components/Toast/Toast";
import { useLockdown } from "../features/lockdown/hooks/useLockdown";
import "./Layout.css";

// ─── Startup phases ──────────────────────────────────────────────
type StartupPhase =
  | "loading"       // Fetching user doc
  | "onboarding"    // First-time user
  | "processing"    // Running gap processor
  | "welcome_back"  // Auto-freeze triggered, showing WelcomeBack
  | "ready";        // Normal operation

function LayoutInner() {
  const { user } = useAuthContext();
  const userStore = useUserStore();
  const navigate = useNavigate();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [userDoc, setUserDoc] = useState<User | null>(null);
  const [phase, setPhase] = useState<StartupPhase>("loading");
  const [showPunishment, setShowPunishment] = useState(false);

  // Freeze / WelcomeBack state
  const [frozenSince, setFrozenSince] = useState<string | null>(null);
  const [gapResult, setGapResult] = useState<GapProcessorResult | null>(null);

  // Command Palette data
  const [paletteHabits, setPaletteHabits] = useState<Habit[]>([]);
  const [paletteTodos, setPaletteTodos] = useState<Todo[]>([]);

  const { strikes, isLocked } = useStrikes();
  const { isActive: isLockdownActive } = useLockdown();
  useNotifications();

  // ── Phase 1: Load user doc (delegates to UserStore) ────────────
  useEffect(() => {
    if (userStore.loading) return;

    const doc = userStore.userDoc;
    if (doc) {
      setUserDoc(doc);
      document.documentElement.style.setProperty("--accent", doc.aesthetics.desktop.accentColor);
      
      // Dim and Blur intensity
      const dimStr = (doc.aesthetics.desktop.dimIntensity ?? 0.2).toString();
      const blurStr = `${doc.aesthetics.desktop.blurIntensity ?? 0}px`;
      document.documentElement.style.setProperty("--app-wallpaper-dim", dimStr);
      document.documentElement.style.setProperty("--app-wallpaper-blur", blurStr);

      // Low Graphics Mode
      if (doc.settings.lowGraphicsMode) {
        document.body.classList.add("low-graphics");
      } else {
        document.body.classList.remove("low-graphics");
      }

      setPhase("processing");
    } else if (user) {
      setPhase("onboarding");
    }
  }, [user, userStore.loading, userStore.userDoc]);

  // ── Apply Desktop Wallpaper (Local cache) ──────────────────────
  useEffect(() => {
    async function applyWallpaper() {
      try {
        const desktopUrl = await getLocalWallpaper("desktop");
        if (desktopUrl) {
          document.documentElement.style.setProperty("--app-wallpaper", `url('${desktopUrl}')`);
        } else {
          document.documentElement.style.removeProperty("--app-wallpaper");
        }
      } catch {
        document.documentElement.style.removeProperty("--app-wallpaper");
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

  // ── Z-Order Enforcer: Main Window Pull-Up ───────────────────────
  useEffect(() => {
    let active = true;
    let unsubPromise: Promise<() => void> | null = null;
    async function setupZOrderEnforcer() {
      try {
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const mainWin = getCurrentWebviewWindow();
        if (mainWin.label === "main") {
          const unsub = await mainWin.onFocusChanged(async ({ payload: focused }) => {
            if (!active) return;
            if (focused) {
              await mainWin.setFocus();
            }
          });
          return unsub;
        }
      } catch { /* Not in Tauri */ }
      return () => {};
    }
    unsubPromise = setupZOrderEnforcer();
    return () => {
      active = false;
      if (unsubPromise) {
        unsubPromise.then((unsub) => unsub()).catch(() => {});
      }
    };
  }, []);

  // ── Initialize global toasts ─────────────────────────────────
  const { showToast } = useToast();
  
  useEffect(() => {


    // Initialize the updater once globally
    initUpdater();

    const handleGlobalToast = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        showToast(customEvent.detail);
      }
    };
    
    window.addEventListener('w:toast', handleGlobalToast);
    return () => window.removeEventListener('w:toast', handleGlobalToast);
  }, [showToast]);

  // ── Phase 2: Run gap processor ─────────────────────────────────
  useEffect(() => {
    if (phase !== "processing" || !userDoc) return;

    let cancelled = false;

    async function runGapProcessor() {
      try {
        const dailyResetTime = userDoc?.settings?.dailyResetTime;
        const today = getToday(undefined, dailyResetTime);
        const result = await processGap(userDoc!.lastActiveDate, today);
        if (cancelled) return;

        setGapResult(result);

        if (result.autoFreezeTriggered && result.frozenSince) {
          setFrozenSince(result.frozenSince);
          setPhase("welcome_back");
        } else {
          setPhase("ready");
        }
      } catch (err) {
        console.error("Gap processor error:", err);
        if (!cancelled) setPhase("ready");
      }
    }

    runGapProcessor();
    return () => { cancelled = true; };
  }, [phase, userDoc]);

  // ── Phase 3: Launch sticky overlay + widget windows ────────────
  useEffect(() => {
    if (phase !== "ready") return;

    async function launchStickyOverlay() {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const { availableMonitors } = await import("@tauri-apps/api/window");
        const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");

        let minX = 0;
        let minY = 0;
        let maxX = 800;
        let maxY = 600;

        try {
          const monitors = await availableMonitors();
          if (monitors && monitors.length > 0) {
            minX = Math.min(...monitors.map((m) => m.position.x));
            minY = Math.min(...monitors.map((m) => m.position.y));
            maxX = Math.max(...monitors.map((m) => m.position.x + m.size.width));
            maxY = Math.max(...monitors.map((m) => m.position.y + m.size.height));
          }
        } catch (err) {
          console.error("Failed to query available monitors:", err);
        }

        const width = maxX - minX;
        const height = maxY - minY;

        const existing = await WebviewWindow.getByLabel("sticky-overlay");
        if (existing) {
          try {
            await existing.setPosition(new PhysicalPosition(minX, minY));
            await existing.setSize(new PhysicalSize(width, height));
          } catch (e) {
            console.error("Failed to resize existing overlay:", e);
          }
          await existing.show();
          return;
        }

        const overlay = new WebviewWindow("sticky-overlay", {
          url: "/sticky-canvas",
          decorations: false,
          transparent: true,
          maximized: false,
          skipTaskbar: true,
          visible: false,
          parent: null as any,
          focusable: false,
          focus: false,
          alwaysOnTop: false,
        });

        try {
          await overlay.setPosition(new PhysicalPosition(minX, minY));
          await overlay.setSize(new PhysicalSize(width, height));
        } catch (e) {
          console.error("Failed to size/position new overlay:", e);
        }

        await overlay.show();

        overlay.once("tauri://error", (_e: unknown) => {
          console.error("Failed to create sticky overlay");
        });
      } catch {
        // Not running in Tauri (browser dev mode)
      }
    }

    async function launchWidget() {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const existing = await WebviewWindow.getByLabel("widget");
        if (existing) {
          await existing.show();
        } else {
          const widget = new WebviewWindow("widget", {
            url: "/widget",
            decorations: false,
            transparent: true,
            width: 400,
            height: 580,
            skipTaskbar: true,
            visible: true,
            parent: null as any,
            focusable: false,
            focus: false,
            alwaysOnTop: false,
          });
          widget.once("tauri://error", (_e: unknown) => {
            console.error("Failed to create widget");
          });
        }

        // Try WorkerW embedding (non-blocking)
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          setTimeout(async () => {
            try {
              await invoke("embed_widget_in_desktop");
            } catch (_e) {
              // WorkerW embedding unavailable, widget floats normally
            }
          }, 500);
        } catch { /* Not in Tauri */ }
      } catch {
        // Not in Tauri
      }
    }

    launchStickyOverlay();
    launchWidget();

    // Listen for re-launch requests from settings/etc
    const handleWidgetRelaunch = () => launchWidget();
    const handleStickyRelaunch = () => launchStickyOverlay();

    window.addEventListener("w:launch-widget", handleWidgetRelaunch);
    window.addEventListener("w:launch-sticky", handleStickyRelaunch);

    return () => {
      window.removeEventListener("w:launch-widget", handleWidgetRelaunch);
      window.removeEventListener("w:launch-sticky", handleStickyRelaunch);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "ready" || !user) return;

    let isUnmounted = false;
    let heartbeatInterval: any;

    async function initializeSync() {
      // SECURITY: Legacy Firestore notes migration removed (Batch 36)
      // Daily notes are local-only — they NEVER touch Firestore.

      if (isUnmounted) return;

      // 1.2. Flush pending offline strikes (non-blocking)
      try {
        const { flushOfflineStrikes } = await import("../features/strikes/services/strikeService");
        await flushOfflineStrikes();
      } catch (err) {
        console.error("[Sync Engine] Offline strikes flush failed:", err);
      }

      if (isUnmounted) return;

      // 1.5. Run weekly auto-backup check (non-blocking, only inside Tauri native environments)
      try {
        const { checkAutoBackup } = await import("../features/settings/services/backupService");
        await checkAutoBackup();
      } catch (err) {
        console.error("[Sync Engine] Weekly auto-backup check failed:", err);
      }

      if (isUnmounted) return;

      // 2. Trigger GDrive sync background worker instantly to flush pending offline writes
      try {
        const { runBackgroundSync } = await import("../shared/services/googleDriveService");
        await runBackgroundSync();
      } catch (err) {
        console.error("[Sync Engine] Initial background sync execution failed:", err);
      }

      if (isUnmounted) return;

      // 2.5. Pull down any notes from Google Drive that are missing locally
      try {
        const { getValidAccessToken, pullNotesFromDrive } = await import("../shared/services/googleDriveService");
        const accessToken = await getValidAccessToken();
        if (accessToken) {
          await pullNotesFromDrive(accessToken);
        }
      } catch (err) {
        console.error("[Sync Engine] Drive notes pull-down failed:", err);
      }

      if (isUnmounted) return;

      // 3. Register standard browser online event listener for instant reconnection triggers
      const handleOnline = async () => {
        console.info("[Sync Engine] Connection restored. Firing background sync worker and flushing strikes...");
        try {
          const { flushOfflineStrikes } = await import("../features/strikes/services/strikeService");
          await flushOfflineStrikes();
        } catch (err) {
          console.error("[Sync Engine] Offline strikes flush failed on reconnect:", err);
        }
        try {
          const { runBackgroundSync } = await import("../shared/services/googleDriveService");
          await runBackgroundSync();
        } catch (err) {
          console.error("[Sync Engine] Reconnection sync execution failed:", err);
        }
      };
      window.addEventListener("online", handleOnline);

      // 4. Setup periodic 5-minute heartbeat interval (300,000 milliseconds)
      heartbeatInterval = setInterval(async () => {
        console.info("[Sync Engine] Running periodic 5-minute background sync heartbeat...");
        try {
          const { runBackgroundSync } = await import("../shared/services/googleDriveService");
          await runBackgroundSync();
        } catch (err) {
          console.error("[Sync Engine] Heartbeat sync execution failed:", err);
        }
      }, 300000);

      return () => {
        window.removeEventListener("online", handleOnline);
      };
    }

    let cleanupOnlineListener: (() => void) | undefined;
    initializeSync().then((cleanup) => {
      cleanupOnlineListener = cleanup;
    });

    return () => {
      isUnmounted = true;
      if (cleanupOnlineListener) cleanupOnlineListener();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, [phase, user]);

  // ── Sync Engine: 5-minute pre-reset daily note backup scheduler ───────
  useEffect(() => {
    if (phase !== "ready" || !user) return;

    let backupTimer: NodeJS.Timeout | null = null;
    let isUnmounted = false;

    // Fetch user reset time (reactive dynamically)
    const resetTime = userDoc?.settings?.dailyResetTime || localStorage.getItem("w_daily_reset_time") || "04:00";

    function scheduleBackup() {
      if (isUnmounted) return;

      const msUntilBackup = getMsUntilBackup(resetTime, new Date());
      console.info(`[Sync Scheduler] Scheduling next daily note backup in ${Math.round(msUntilBackup / 1000 / 60)} minutes (${msUntilBackup} ms) for reset time ${resetTime}.`);

      if (backupTimer) clearTimeout(backupTimer);

      backupTimer = setTimeout(async () => {
        console.info("[Sync Scheduler] Target pre-reset backup window reached! Triggering sync background worker...");
        try {
          const { runBackgroundSync } = await import("../shared/services/googleDriveService");
          await runBackgroundSync();
        } catch (err) {
          console.error("[Sync Scheduler] Background backup sync task failed:", err);
        }
        // Reschedule for next day's cycle
        scheduleBackup();
      }, msUntilBackup);
    }

    scheduleBackup();

    return () => {
      isUnmounted = true;
      if (backupTimer) clearTimeout(backupTimer);
    };
  }, [phase, user, userDoc?.settings?.dailyResetTime]);

  // ── Phase 4: Load palette data (habits + todos for CommandPalette) reactively ──
  useEffect(() => {
    if (phase !== "ready" || !user) {
      setPaletteHabits([]);
      setPaletteTodos([]);
      return;
    }

    const habitsRef = collection(db, "users", user.uid, "habits");
    const habitsQuery = query(habitsRef, where("isActive", "==", true));
    const unsubHabits = onSnapshot(habitsQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Habit));
      data.sort((a, b) => a.order - b.order);
      const activeHabits = data.filter(h => !h.startDate || h.startDate <= getToday(undefined, userDoc?.settings?.dailyResetTime));
      setPaletteHabits(activeHabits);
    }, (err) => {
      console.warn("[Layout] Habits listener failed:", err);
    });

    const todosRef = collection(db, "users", user.uid, "todos");
    const unsubTodos = onSnapshot(todosRef, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Todo));
      setPaletteTodos(data);
    }, (err) => {
      console.warn("[Layout] Todos listener failed:", err);
    });

    return () => {
      unsubHabits();
      unsubTodos();
    };
  }, [phase, user, userDoc?.settings?.dailyResetTime]);

  const globalStreak = useMemo(() => {
    return paletteHabits.reduce((max, h) => Math.max(max, h.currentStreak || 0), 0);
  }, [paletteHabits]);

  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((prev) => !prev);
  }, []);

  // ── N key (context-dependent new item) ─────────────────────────
  const location = useLocation();

  const handleNewItem = useCallback(() => {
    if (location.pathname === "/todos") {
      window.dispatchEvent(new CustomEvent("w:open-todo-form"));
    } else {
      if (location.pathname !== "/habits") navigate("/habits");
      setTimeout(() => window.dispatchEvent(new CustomEvent("w:open-habit-form")), 50);
    }
  }, [location.pathname, navigate]);

  // ── Space key (quick-complete focused habit) ───────────────────
  const handleQuickComplete = useCallback(() => {
    // Dispatch event for DashboardPage to complete its focused card
    window.dispatchEvent(new CustomEvent("w:quick-complete"));
  }, []);

  useKeyboardShortcuts(toggleCommandPalette, handleNewItem, handleQuickComplete, isLocked);

  // ── Command palette actions ────────────────────────────────────
  const handlePaletteCompleteHabit = useCallback(async (habitId: string) => {
    try {
      await completeHabit(habitId, 1, undefined, "", userDoc?.settings?.dailyResetTime);
      // Refresh palette data
      const habits = await getHabits();
      const activeHabits = habits.filter(h => !h.startDate || h.startDate <= getToday());
      setPaletteHabits(activeHabits);
    } catch (err) {
      console.error("Failed to complete habit via palette:", err);
    }
  }, [userDoc]);

  const handlePaletteNewHabit = useCallback(() => {
    if (location.pathname !== "/habits") navigate("/habits");
    setTimeout(() => window.dispatchEvent(new CustomEvent("w:open-habit-form")), 50);
  }, [location.pathname, navigate]);

  const handlePaletteNewTodo = useCallback(() => {
    if (location.pathname !== "/todos") navigate("/todos");
    setTimeout(() => window.dispatchEvent(new CustomEvent("w:open-todo-form")), 50);
  }, [location.pathname, navigate]);

  // ── Render: Loading ────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="t-meta">LOADING USER DATA...</span>
      </div>
    );
  }

  // ── Render: Onboarding ─────────────────────────────────────────
  if (phase === "onboarding") {
    return (
      <OnboardingFlow
        onComplete={async () => {
          // 1. Reload the user store to fetch the newly created doc
          await userStore.reload();
          
          // 2. Local sync of accent color if available
          const doc = userStore.userDoc;
          if (doc) {
            document.documentElement.style.setProperty("--accent", doc.aesthetics.desktop.accentColor);
          }
          
          // 3. Transition to processing to run the gap processor
          setPhase("processing");
        }}
      />
    );
  }

  // ── Render: Processing gap ─────────────────────────────────────
  if (phase === "processing") {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="t-meta">CHECKING MISSED DAYS...</span>
      </div>
    );
  }

  // ── Render: Welcome Back (auto-freeze) ─────────────────────────
  if (phase === "welcome_back" && frozenSince) {
    return (
      <WelcomeBack
        frozenSince={frozenSince}
        today={getToday()}
        onResume={() => {
          setFrozenSince(null);
          setPhase("ready");
        }}
      />
    );
  }

  // ── Render: Normal operation ───────────────────────────────────
  const handlePunishment = async (
    choice: PunishmentChoice,
    habitId?: string,
    completedInline?: boolean
  ) => {
    try {
      if (completedInline) {
        setShowPunishment(false);
        return;
      }
      const result = await applyPunishment(choice, habitId);
      setShowPunishment(false);
      if (result === "redirect_habit") {
        navigate("/habits");
        setTimeout(() => window.dispatchEvent(new CustomEvent("w:open-habit-form")), 100);
      } else if (result === "redirect_todo") {
        navigate("/todos");
        setTimeout(() => window.dispatchEvent(new CustomEvent("w:open-todo-form")), 100);
      }
      // "resolved" means strikes are already reset — lockout auto-dismisses via onSnapshot
    } catch (err) {
      console.error("[Punishment] Failed to apply:", err);
      setShowPunishment(false);
    }
  };

  return (
    <div className="layout">
      <div inert={isLocked ? true : undefined} style={{ display: "contents" }}>
        <Sidebar strikeCount={strikes.current} globalStreak={globalStreak} isLockdownActive={isLockdownActive} />
        <Topbar onCommandPaletteOpen={toggleCommandPalette} />
        <main className="layout__content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              style={{ width: "100%", flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}
            >
              <Outlet context={{ userDoc, gapResult }} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {commandPaletteOpen && (
        <CommandPalette
          onClose={() => setCommandPaletteOpen(false)}
          habits={paletteHabits}
          todos={paletteTodos}
          onCompleteHabit={handlePaletteCompleteHabit}
          onOpenNewHabit={handlePaletteNewHabit}
          onOpenNewTodo={handlePaletteNewTodo}
        />
      )}

      <StrikeWarningToast strikes={strikes} />

      {isLocked && !showPunishment && (
        <LockoutOverlay onResolve={() => setShowPunishment(true)} />
      )}

      {showPunishment && (
        <PunishmentModal
          onConfirm={handlePunishment}
          onCancel={() => setShowPunishment(false)}
        />
      )}

      <UpdateHUD />
    </div>
  );
}

// ─── Wrapped export with UserProvider ────────────────────────────
export function Layout() {
  return (
    <UserProvider>
      <LayoutInner />
    </UserProvider>
  );
}
