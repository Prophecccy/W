import { useState, useCallback, useEffect, useRef } from "react";
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
import { initAlarmScheduler } from "../features/clock/services/alarmScheduler";
import { initTimerScheduler } from "../features/clock/services/timerScheduler";
import { useAuthContext } from "../features/auth/context";
import { getUserDoc } from "../features/auth/services/userService";
import { OnboardingPage } from "../features/auth/components/OnboardingPage";
import { User } from "../shared/types";
import { Habit } from "../features/habits/types";
import { Todo } from "../features/todos/types";
import { getHabits } from "../features/habits/services/habitService";
import { getTodos } from "../features/todos/services/todoService";
import { completeHabit } from "../features/habits/services/logService";
import { getToday } from "../shared/utils/dateUtils";
import { useNotifications } from "../shared/hooks/useNotifications";
import { getLocalWallpaper } from "../shared/utils/storageUtils";
import "./Layout.css";

// ─── Startup phases ──────────────────────────────────────────────
type StartupPhase =
  | "loading"       // Fetching user doc
  | "onboarding"    // First-time user
  | "processing"    // Running gap processor
  | "welcome_back"  // Auto-freeze triggered, showing WelcomeBack
  | "ready";        // Normal operation

export function Layout() {
  const { user } = useAuthContext();
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
  useNotifications();

  // ── Phase 1: Load user doc ─────────────────────────────────────
  useEffect(() => {
    async function init() {
      if (!user) return;
      const doc = await getUserDoc(user.uid);
      if (doc) {
        setUserDoc(doc);
        document.documentElement.style.setProperty("--accent", doc.aesthetics.desktop.accentColor);
        
        // Wallpaper is now fetched locally below
        
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
      } else {
        setPhase("onboarding");
      }
    }
    init();
  }, [user]);

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

  // ── Initialize clock schedulers ─────────────────────────────────
  useEffect(() => {
    try {
      initAlarmScheduler();
      initTimerScheduler();
    } catch(_e) { /* Not in Tauri */ }
  }, []);

  // ── Phase 2: Run gap processor ─────────────────────────────────
  useEffect(() => {
    if (phase !== "processing" || !userDoc) return;

    let cancelled = false;

    async function runGapProcessor() {
      try {
        const today = getToday();
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
        const existing = await WebviewWindow.getByLabel("sticky-overlay");
        if (existing) {
          await existing.show();
          return;
        }
        const overlay = new WebviewWindow("sticky-overlay", {
          url: "/sticky-canvas",
          decorations: false,
          transparent: true,
          fullscreen: true,
          skipTaskbar: true,
          visible: true,
        });
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
            width: 380,
            height: 520,
            skipTaskbar: true,
            visible: true,
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
  }, [phase]);

  // ── Phase 4: Load palette data (habits + todos for CommandPalette) ─
  const paletteDataLoaded = useRef(false);
  useEffect(() => {
    if (phase !== "ready" || paletteDataLoaded.current) return;
    paletteDataLoaded.current = true;

    async function loadPaletteData() {
      try {
        const [habits, todos] = await Promise.all([getHabits(), getTodos()]);
        setPaletteHabits(habits);
        setPaletteTodos(todos);
      } catch {
        // Non-critical — palette will just show pages/actions
      }
    }
    loadPaletteData();
  }, [phase]);

  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((prev) => !prev);
  }, []);

  // ── N key (context-dependent new item) ─────────────────────────
  const location = useLocation();

  const handleNewItem = useCallback(() => {
    if (location.pathname === "/todos") {
      // Dispatch event for TodosPage to open its form
      window.dispatchEvent(new CustomEvent("w:open-todo-form"));
    } else {
      // Default: navigate to dashboard and open habit form
      if (location.pathname !== "/") navigate("/");
      window.dispatchEvent(new CustomEvent("w:open-habit-form"));
    }
  }, [location.pathname, navigate]);

  // ── Space key (quick-complete focused habit) ───────────────────
  const handleQuickComplete = useCallback(() => {
    // Dispatch event for DashboardPage to complete its focused card
    window.dispatchEvent(new CustomEvent("w:quick-complete"));
  }, []);

  useKeyboardShortcuts(toggleCommandPalette, handleNewItem, handleQuickComplete);

  // ── Command palette actions ────────────────────────────────────
  const handlePaletteCompleteHabit = useCallback(async (habitId: string) => {
    try {
      await completeHabit(habitId, 1);
      // Refresh palette data
      const habits = await getHabits();
      setPaletteHabits(habits);
    } catch (err) {
      console.error("Failed to complete habit via palette:", err);
    }
  }, []);

  const handlePaletteNewHabit = useCallback(() => {
    if (location.pathname !== "/") navigate("/");
    window.dispatchEvent(new CustomEvent("w:open-habit-form"));
  }, [location.pathname, navigate]);

  const handlePaletteNewTodo = useCallback(() => {
    if (location.pathname !== "/todos") navigate("/todos");
    window.dispatchEvent(new CustomEvent("w:open-todo-form"));
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
      <OnboardingPage
        onComplete={() => {
          getUserDoc(user!.uid).then((doc) => {
            if (doc) {
              setUserDoc(doc);
              document.documentElement.style.setProperty("--accent", doc.aesthetics.desktop.accentColor);
              setPhase("processing");
            }
          });
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
  const handlePunishment = async (choice: PunishmentChoice) => {
    const result = await applyPunishment(choice);
    setShowPunishment(false);
    if (result === "redirect_habit") {
      navigate("/");
      window.dispatchEvent(new CustomEvent("w:open-habit-form"));
    } else if (result === "redirect_todo") {
      navigate("/todos");
      window.dispatchEvent(new CustomEvent("w:open-todo-form"));
    }
    // "resolved" means strikes are already reset
  };

  return (
    <div className="layout">
      <Sidebar strikeCount={strikes.current} />
      <Topbar onCommandPaletteOpen={toggleCommandPalette} />
      <main className="layout__content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            style={{ width: "100%", height: "100%" }}
          >
            <Outlet context={{ userDoc, gapResult }} />
          </motion.div>
        </AnimatePresence>
      </main>
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
    </div>
  );
}
