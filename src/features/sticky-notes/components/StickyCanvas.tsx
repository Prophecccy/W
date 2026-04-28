import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { doc, onSnapshot } from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
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
  const { todos, positions, loading: notesLoading, suppressSnapshot } = useStickyNotes();
  const [accentReady, setAccentReady] = useState(false);
  const initRef = useRef(false);
  const regionsTimerRef = useRef<number | null>(null);

  // Make body transparent for Tauri transparent window
  useEffect(() => {
    document.body.classList.add("transparent-window");
    return () => document.body.classList.remove("transparent-window");
  }, []);

  // Real-time accent color listener (mirrors useWidgetData pattern)
  // onSnapshot fires immediately with current data AND on every subsequent change.
  useEffect(() => {
    const user = auth.currentUser;
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

    // Listen for realtime color preview from settings
    const unlistenPromise = listen<string>('color-preview', (event) => {
      document.documentElement.style.setProperty('--accent', event.payload);
    });

    return () => {
      unsub();
      unlistenPromise.then(u => u()).catch(() => {});
    };
  }, []);

  // Start the Rust-side mouse hook on mount
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      initHitTest();
    }
  }, []);

  // Update sticky note bounding boxes whenever notes or positions change
  useEffect(() => {
    // Debounce: wait for layout to settle after a React render
    if (regionsTimerRef.current) clearTimeout(regionsTimerRef.current);
    regionsTimerRef.current = window.setTimeout(() => {
      const noteElements = document.querySelectorAll(".sticky-note");
      const regions: StickyRect[] = [];
      noteElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        regions.push({
          left: Math.round(rect.left * window.devicePixelRatio),
          top: Math.round(rect.top * window.devicePixelRatio),
          right: Math.round(rect.right * window.devicePixelRatio),
          bottom: Math.round(rect.bottom * window.devicePixelRatio),
        });
      });
      sendStickyRegions(regions);
    }, 50);

    return () => {
      if (regionsTimerRef.current) clearTimeout(regionsTimerRef.current);
    };
  }, [todos, positions]);

  // ─── Handlers ───────────────────────────────────────────────────

  const handleDragEnd = useCallback(
    (todoId: string, pos: { x: number; y: number }) => {
      // Block Firestore onSnapshot from overwriting this note's position
      // until the debounced write has committed + propagated back.
      suppressSnapshot(todoId);
      savePositionLocal(todoId, pos);
      syncPositionToFirestore(todoId, pos);
    },
    [suppressSnapshot]
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
