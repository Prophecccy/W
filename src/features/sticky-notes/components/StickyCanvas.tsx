import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../../../shared/utils/tauri";
import { db, doc, onSnapshot } from "../../../shared/config/firebase";
import { useAuthContext } from "../../auth/context";
import { useStickyNotes } from "../hooks/useStickyNotes";
import { StickyNote } from "./StickyNote";
import {
  savePositionLocal,
  syncPositionToFirestore,
  removePositionLocal,
} from "../services/positionStore";
import {
  completeTodo,
  incrementNumberedTodo,
  completeNumberedTodoFull,
} from "../../todos/services/todoService";
import "./StickyNote.css";

// ─── Click-Through Architecture ─────────────────────────────────
//
// The sticky-overlay is a fullscreen transparent window (alwaysOnBottom).
// It MUST be click-through (WS_EX_TRANSPARENT) for empty space so the
// taskbar and desktop icons remain usable.
//
// Problem: Tauri v2's setIgnoreCursorEvents(true) blocks ALL events —
// the webview never receives onMouseEnter, so we can't toggle it back
// from JavaScript when the cursor enters a sticky note.
//
// Solution: A Rust-side WH_MOUSE_LL hook that runs at the OS level,
// checks cursor position against registered sticky note bounding
// boxes, and toggles WS_EX_TRANSPARENT in real time. The hook fires
// BEFORE the OS dispatches the mouse event, so there's zero delay.
//
// Flow:
// 1. On mount → call start_sticky_hit_test() to install the hook
// 2. On layout change → call update_sticky_regions() with note rects
// 3. On pointer down → call force_sticky_interactive() to ensure
//    the first click registers even if the hook hasn't toggled yet
// 4. The hook handles everything else automatically

// ─── Helpers ────────────────────────────────────────────────────

interface StickyRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

async function initHitTest() {
  try {
    await invoke("start_sticky_hit_test");
  } catch (e) {
    console.warn("Failed to start sticky hit test:", e);
  }
}

/**
 * Send updated sticky note bounding boxes to Rust for hit-testing.
 * Call this whenever notes change position or the set of notes changes.
 */
export async function sendStickyRegions(regions: StickyRect[]) {
  try {
    await invoke("update_sticky_regions", { regions });
  } catch {
    // Not running in Tauri
  }
}

/**
 * Force the overlay to be interactive right now.
 * Called on pointerdown to ensure the first click registers.
 */
export async function forceInteractive() {
  try {
    await invoke("force_sticky_interactive");
  } catch {
    // Not running in Tauri
  }
}

// ─── StickyCanvas Component ─────────────────────────────────────

export function StickyCanvas() {
  const { user } = useAuthContext();
  const { todos, positions, loading: notesLoading, suppressSnapshot } = useStickyNotes();
  const [accentReady, setAccentReady] = useState(false);
  const initRef = useRef(false);
  const regionsTimerRef = useRef<number | null>(null);

  // Redirect console logs to localDb log file for diagnostics
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).__TAURI_INTERNALS__) return;
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const logToLocalDb = async (level: string, args: any[]) => {
      try {
        const msg = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
        const logLine = `[${new Date().toISOString()}] [StickyCanvas ${level}]: ${msg}`;
        const { writeTextFile, readTextFile, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        const logFile = "w_localdb_sticky-overlay_debug.log";
        let current = "";
        if (await exists(logFile, { baseDir: BaseDirectory.AppData })) {
          current = await readTextFile(logFile, { baseDir: BaseDirectory.AppData });
        }
        await writeTextFile(logFile, current + "\n" + logLine, { baseDir: BaseDirectory.AppData });
      } catch {}
    };

    console.log = (...args) => {
      originalLog(...args);
      logToLocalDb("INFO", args);
    };
    console.error = (...args) => {
      originalError(...args);
      logToLocalDb("ERROR", args);
    };
    console.warn = (...args) => {
      originalWarn(...args);
      logToLocalDb("WARN", args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  // Make body transparent for Tauri transparent window
  useEffect(() => {
    document.body.classList.add("transparent-window");
    return () => document.body.classList.remove("transparent-window");
  }, []);

  // Real-time accent color listener (mirrors useWidgetData pattern)
  // onSnapshot fires immediately with current data AND on every subsequent change.
  useEffect(() => {
    if (!user) {
      setAccentReady(true);
      return;
    }

    const userRef = doc(db, "users", user.uid);
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const accent = data?.aesthetics?.desktop?.accentColor;
        if (accent) {
          document.documentElement.style.setProperty("--accent", accent);
        }
      }
      setAccentReady(true);
    });

    // Listen for realtime color preview from settings if running in Tauri
    let unlistenPromise: Promise<() => void> | null = null;
    if (isTauri()) {
      unlistenPromise = listen<string>('color-preview', (event) => {
        document.documentElement.style.setProperty('--accent', event.payload);
      });
    }

    return () => {
      unsub();
      if (unlistenPromise) {
        unlistenPromise.then(u => u()).catch(() => {});
      }
    };
  }, [user]);

  // Start the Rust-side mouse hook on mount
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      initHitTest();
    }
  }, []);

  // Clamping check for off-screen notes (e.g. after monitor disconnection)
  const isInitializedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      isInitializedRef.current = true;
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isInitializedRef.current || notesLoading || !accentReady) return;
    if (todos.length === 0) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Safety threshold: don't clamp if window is abnormally small (initializing or hidden)
    if (width <= 800 || height <= 600) return;

    todos.forEach((todo) => {
      const pos = positions[todo.id] || todo.stickyPosition;
      if (pos) {
        // StickyNote size is roughly 300x200
        const clampedX = Math.max(20, Math.min(pos.x, width - 320));
        const clampedY = Math.max(20, Math.min(pos.y, height - 220));

        if (clampedX !== pos.x || clampedY !== pos.y) {
          console.log(`[StickyCanvas] Clamping off-screen note ${todo.title} (${todo.id}) from (${pos.x}, ${pos.y}) to (${clampedX}, ${clampedY})`);
          savePositionLocal(todo.id, { x: clampedX, y: clampedY });
          syncPositionToFirestore(todo.id, { x: clampedX, y: clampedY });
        }
      }
    });
  }, [todos, positions, notesLoading, accentReady]);

  // Update sticky note bounding boxes whenever notes or positions change
  const triggerUpdateRegions = useCallback(() => {
    if (regionsTimerRef.current) clearTimeout(regionsTimerRef.current);
    regionsTimerRef.current = window.setTimeout(async () => {
      let offsetX = 0;
      let offsetY = 0;
      try {
        if (isTauri()) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const pos = await getCurrentWindow().outerPosition();
          offsetX = pos.x;
          offsetY = pos.y;
        }
      } catch (err) {
        console.error("Failed to get window position for hit test:", err);
      }

      const noteElements = document.querySelectorAll(".sticky-note");
      const regions: StickyRect[] = [];
      noteElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        regions.push({
          left: Math.round(rect.left * window.devicePixelRatio) + offsetX,
          top: Math.round(rect.top * window.devicePixelRatio) + offsetY,
          right: Math.round(rect.right * window.devicePixelRatio) + offsetX,
          bottom: Math.round(rect.bottom * window.devicePixelRatio) + offsetY,
        });
      });
      sendStickyRegions(regions);
    }, 50);
  }, [todos, positions]);

  useEffect(() => {
    triggerUpdateRegions();

    window.addEventListener("resize", triggerUpdateRegions);
    return () => {
      if (regionsTimerRef.current) clearTimeout(regionsTimerRef.current);
      window.removeEventListener("resize", triggerUpdateRegions);
    };
  }, [triggerUpdateRegions]);

  // Scale change listener for DPI changes
  useEffect(() => {
    let active = true;
    let unsubPromise: Promise<() => void> | null = null;

    if (isTauri()) {
      const setupScaleListener = async () => {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          const unsub = await win.onScaleChanged(() => {
            if (active) {
              console.log("[StickyCanvas] Scale factor changed. Reloading window...");
              window.location.reload();
            }
          });
          return unsub;
        } catch (err) {
          console.error("Failed to setup scale changed listener:", err);
          return () => {};
        }
      };
      unsubPromise = setupScaleListener();
    }

    return () => {
      active = false;
      if (unsubPromise) {
        unsubPromise.then(unsub => unsub()).catch(() => {});
      }
    };
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────

  const handleDragEnd = useCallback(
    async (todoId: string, pos: { x: number; y: number }) => {
      // Find old position before overwrite
      const oldPos = positions[todoId] || todos.find((t) => t.id === todoId)?.stickyPosition || { x: 100, y: 100 };

      // Block Firestore onSnapshot from overwriting this note's position
      // until the debounced write has committed + propagated back.
      suppressSnapshot(todoId);
      savePositionLocal(todoId, pos);
      syncPositionToFirestore(todoId, pos);

      if (isTauri()) {
        try {
          const { getCurrentWindow, monitorFromPoint } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          const winPos = await win.outerPosition();
          const dpr = window.devicePixelRatio || 1;

          const oldPhysX = Math.round(oldPos.x * dpr) + winPos.x;
          const oldPhysY = Math.round(oldPos.y * dpr) + winPos.y;
          const newPhysX = Math.round(pos.x * dpr) + winPos.x;
          const newPhysY = Math.round(pos.y * dpr) + winPos.y;

          const oldMonitor = await monitorFromPoint(oldPhysX, oldPhysY);
          const newMonitor = await monitorFromPoint(newPhysX, newPhysY);

          if (oldMonitor && newMonitor && oldMonitor.name !== newMonitor.name) {
            console.log(`[StickyCanvas] Note moved to new monitor: ${oldMonitor.name} -> ${newMonitor.name}. Reloading...`);
            window.location.reload();
          }
        } catch (err) {
          console.error("[StickyCanvas] Failed to check monitor onDragEnd:", err);
        }
      }
    },
    [suppressSnapshot, positions, todos]
  );

  const handleComplete = useCallback(async (todoId: string) => {
    try {
      await completeTodo(todoId);
      removePositionLocal(todoId);
    } catch (e) {
      console.error("Failed to complete todo from sticky:", e);
    }
  }, []);

  // Stable ref for todos so callbacks don't change identity on every onSnapshot
  const todosRef = useRef(todos);
  todosRef.current = todos;

  const handleIncrement = useCallback(
    async (todoId: string) => {
      const todo = todosRef.current.find((t) => t.id === todoId);
      if (!todo) return;
      try {
        await incrementNumberedTodo(todoId, todo);
        if (
          todo.numbered &&
          todo.numbered.current + 1 >= todo.numbered.target
        ) {
          removePositionLocal(todoId);
        }
      } catch (e) {
        console.error("Failed to increment todo from sticky:", e);
      }
    },
    []
  );

  const handleFullComplete = useCallback(
    async (todoId: string) => {
      const todo = todosRef.current.find((t) => t.id === todoId);
      if (!todo) return;
      try {
        await completeNumberedTodoFull(todoId, todo);
        removePositionLocal(todoId);
      } catch (e) {
        console.error("Failed to full-complete todo from sticky:", e);
      }
    },
    []
  );

  if (notesLoading || !accentReady) {
    return <div className="sticky-canvas" />;
  }

  return (
    <div className="sticky-canvas">
      {todos.map((todo) => {
        const pos = positions[todo.id] || todo.stickyPosition || { x: 100, y: 100 };

        return (
          <StickyNote
            key={todo.id}
            todo={todo}
            position={pos}
            onDragEnd={handleDragEnd}
            onComplete={handleComplete}
            onIncrement={handleIncrement}
            onFullComplete={handleFullComplete}
          />
        );
      })}
    </div>
  );
}
