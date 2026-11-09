import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "../../../shared/utils/tauri";
import { db, doc, onSnapshot } from "../../../shared/config/firebase";
import { useAuthContext } from "../../auth/context";
import { useStickyNotes } from "../hooks/useStickyNotes";
import { StickyNote } from "./StickyNote";
import {
  saveStickyPlacementLocal,
  loadPlacementsLocal,
  removePositionLocal,
  StickyPlacement,
} from "../services/positionStore";
import {
  completeTodo,
  incrementNumberedTodo,
  completeNumberedTodoFull,
} from "../../todos/services/todoService";
import { initAudioOnUserGesture } from "../../../shared/services/tactileAudioService";
import "./StickyNote.css";

async function safeInvoke(cmd: string, args?: any) {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke(cmd, args);
    } catch (e) {
      console.error(`safeInvoke failed for command ${cmd}:`, e);
    }
  }
}

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
    await safeInvoke("start_sticky_hit_test");
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
    await safeInvoke("update_sticky_regions", { regions });
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
    await safeInvoke("force_sticky_interactive");
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

  useEffect(() => {
    initAudioOnUserGesture();
  }, []);

  // Intercept close request to flush all pending completed todo writes
  useEffect(() => {
    if (!isTauri()) return;
    let unlistenClose: (() => void) | null = null;
    let isClosed = false;

    const setupCloseHandler = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        
        unlistenClose = await win.onCloseRequested(async (event) => {
          if (isClosed) return;
          event.preventDefault(); // Stop window from closing instantly
          isClosed = true;

          try {
            const { flushPendingCompletions } = await import("../../todos/services/todoService");
            const { flushPendingSyncs } = await import("../services/positionStore");
            await Promise.all([
              flushPendingCompletions(),
              flushPendingSyncs()
            ]);
          } catch (err) {
            console.error("Failed to flush pending completions or positions on close:", err);
          }

          await win.destroy(); // Close window permanently
        });
      } catch (err) {
        console.error("Failed to set up onCloseRequested handler:", err);
      }
    };

    setupCloseHandler();

    return () => {
      if (unlistenClose) unlistenClose();
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
    const originalAccent = document.documentElement.style.getPropertyValue("--accent");

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
      import("@tauri-apps/api/event").then(({ listen }) => {
        unlistenPromise = listen<string>('color-preview', (event) => {
          document.documentElement.style.setProperty('--accent', event.payload);
        });
      }).catch(() => {});
    }

    return () => {
      unsub();
      if (unlistenPromise) {
        unlistenPromise.then(u => u()).catch(() => {});
      }
      if (originalAccent) {
        document.documentElement.style.setProperty("--accent", originalAccent);
      } else {
        document.documentElement.style.removeProperty("--accent");
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

  // ─── Multi-Monitor Effective Placements ────────────────────────
  // Non-destructively maps notes to their saved monitor positions,
  // falling back to primary monitor when secondary monitor is disconnected.
  const [effectivePositions, setEffectivePositions] = useState<Record<string, { x: number; y: number }>>({});
  const fallbackNotesRef = useRef<Set<string>>(new Set());

  const computeEffectivePositions = useCallback(async () => {
    const placements = loadPlacementsLocal();
    if (!isTauri()) {
      const eff: Record<string, { x: number; y: number }> = {};
      todos.forEach((t) => {
        const p = placements[t.id] || positions[t.id] || t.stickyPosition || { x: 100, y: 100 };
        eff[t.id] = { x: p.x, y: p.y };
      });
      setEffectivePositions(eff);
      return;
    }

    try {
      const { availableMonitors, primaryMonitor, getCurrentWindow } = await import("@tauri-apps/api/window");
      const monitors = await availableMonitors();
      if (!monitors || monitors.length === 0) return;

      const primary = (await primaryMonitor()) || monitors[0];
      const win = getCurrentWindow();
      const winPos = await win.outerPosition();
      const dpr = window.devicePixelRatio || 1;

      const newEff: Record<string, { x: number; y: number }> = {};
      const newFallbacks = new Set<string>();

      todos.forEach((todo) => {
        const p: StickyPlacement = placements[todo.id] || (positions[todo.id] as any) || (todo.stickyPosition as any) || { x: 100, y: 100 };

        // Check if the monitor where this note was saved is currently available
        let isTargetMonitorConnected = false;
        if (p.monitorName) {
          isTargetMonitorConnected = monitors.some((m) => m.name === p.monitorName);
        } else {
          // If no monitorName recorded, check if coordinate falls within any active monitor
          const physX = Math.round(p.x * dpr) + winPos.x;
          const physY = Math.round(p.y * dpr) + winPos.y;
          isTargetMonitorConnected = monitors.some(
            (m) =>
              physX >= m.position.x &&
              physX < m.position.x + m.size.width &&
              physY >= m.position.y &&
              physY < m.position.y + m.size.height
          );
        }

        if (isTargetMonitorConnected) {
          // Monitor is active: display directly at target position
          newEff[todo.id] = { x: p.x, y: p.y };
        } else {
          // Target monitor disconnected: provide safe fallback on primary monitor without overwriting disk
          newFallbacks.add(todo.id);
          const primLogicalWidth = Math.round(primary.size.width / (primary.scaleFactor || 1));
          const primLogicalHeight = Math.round(primary.size.height / (primary.scaleFactor || 1));

          const fallbackX = Math.max(30, Math.min(p.relativeX ?? p.x, primLogicalWidth - 320));
          const fallbackY = Math.max(30, Math.min(p.relativeY ?? p.y, primLogicalHeight - 220));

          newEff[todo.id] = { x: fallbackX, y: fallbackY };
          console.log(`[StickyCanvas] Displaying fallback on primary for note ${todo.title} (${todo.id}): (${fallbackX}, ${fallbackY})`);
        }
      });

      fallbackNotesRef.current = newFallbacks;
      setEffectivePositions(newEff);
    } catch (err) {
      console.error("[StickyCanvas] Failed to compute effective positions:", err);
    }
  }, [todos, positions]);

  useEffect(() => {
    computeEffectivePositions();
  }, [computeEffectivePositions]);

  // Listen for monitor hardware topology changes (connect/disconnect)
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    let active = true;

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("w://monitors-changed", () => {
        if (!active) return;
        console.log("[StickyCanvas] Received w://monitors-changed. Re-evaluating note placements...");
        setTimeout(() => {
          if (active) computeEffectivePositions();
        }, 300);
      }).then((u) => {
        unlisten = u;
      });
    }).catch((err) => console.error("Failed to listen for monitors-changed:", err));

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [computeEffectivePositions]);

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
  }, [triggerUpdateRegions, accentReady, effectivePositions]);

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
      const oldPos = effectivePositions[todoId] || positions[todoId] || todos.find((t) => t.id === todoId)?.stickyPosition || { x: 100, y: 100 };

      // Block Firestore onSnapshot from overwriting this note's position
      suppressSnapshot(todoId);
      fallbackNotesRef.current.delete(todoId); // User intentionally placed this note

      if (isTauri()) {
        try {
          const { availableMonitors, getCurrentWindow, monitorFromPoint } = await import("@tauri-apps/api/window");
          const monitors = await availableMonitors();
          const win = getCurrentWindow();
          const winPos = await win.outerPosition();
          const dpr = window.devicePixelRatio || 1;

          const oldPhysX = Math.round(oldPos.x * dpr) + winPos.x;
          const oldPhysY = Math.round(oldPos.y * dpr) + winPos.y;
          const newPhysX = Math.round(pos.x * dpr) + winPos.x;
          const newPhysY = Math.round(pos.y * dpr) + winPos.y;

          const oldMonitor = await monitorFromPoint(oldPhysX, oldPhysY);
          const newMonitor = await monitorFromPoint(newPhysX, newPhysY);

          const targetMon = newMonitor || monitors.find((m) =>
            newPhysX >= m.position.x && newPhysX < m.position.x + m.size.width &&
            newPhysY >= m.position.y && newPhysY < m.position.y + m.size.height
          ) || monitors[0];

          const relX = targetMon ? Math.round((newPhysX - targetMon.position.x) / dpr) : pos.x;
          const relY = targetMon ? Math.round((newPhysY - targetMon.position.y) / dpr) : pos.y;

          saveStickyPlacementLocal(todoId, {
            x: pos.x,
            y: pos.y,
            monitorName: targetMon?.name || undefined,
            relativeX: relX,
            relativeY: relY,
            totalMonitorsWhenSaved: monitors.length,
          });

          setEffectivePositions((prev) => ({ ...prev, [todoId]: pos }));

          if (oldMonitor && newMonitor && oldMonitor.name !== newMonitor.name) {
            console.log(`[StickyCanvas] Note moved to new monitor: ${oldMonitor.name} -> ${newMonitor.name}. Reloading...`);
            window.location.reload();
          }
        } catch (err) {
          console.error("[StickyCanvas] Failed to check monitor onDragEnd:", err);
          saveStickyPlacementLocal(todoId, { x: pos.x, y: pos.y });
          setEffectivePositions((prev) => ({ ...prev, [todoId]: pos }));
        }
      } else {
        saveStickyPlacementLocal(todoId, { x: pos.x, y: pos.y });
        setEffectivePositions((prev) => ({ ...prev, [todoId]: pos }));
      }
    },
    [suppressSnapshot, effectivePositions, positions, todos]
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
        const pos = effectivePositions[todo.id] || positions[todo.id] || todo.stickyPosition || { x: 100, y: 100 };

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
