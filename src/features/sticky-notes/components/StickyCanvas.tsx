import { useCallback, useEffect, useRef } from "react";
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

// ─── Click-Through Logic ────────────────────────────────────────
// We dynamically toggle cursor event ignoring based on whether
// the mouse is over a sticky note element or empty space.
// This lets clicks on transparent areas pass through to the desktop.

let tauriWindowRef: { setIgnoreCursorEvents: (ignore: boolean) => Promise<void> } | null = null;

async function initClickThrough() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    tauriWindowRef = getCurrentWindow();
    // Start with events ignored (transparent = click-through)
    await tauriWindowRef.setIgnoreCursorEvents(true);
  } catch {
    // Not running in Tauri (browser dev mode) — skip
    tauriWindowRef = null;
  }
}

export function enableCursorEvents() {
  tauriWindowRef?.setIgnoreCursorEvents(false);
}

export function disableCursorEvents() {
  tauriWindowRef?.setIgnoreCursorEvents(true);
}

// ─── StickyCanvas Component ─────────────────────────────────────

export function StickyCanvas() {
  const { todos, positions, loading } = useStickyNotes();
  const initRef = useRef(false);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      initClickThrough();
    }
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────

  const handleDragEnd = useCallback(
    (todoId: string, pos: { x: number; y: number }) => {
      // Save locally (instant)
      savePositionLocal(todoId, pos);
      // Debounced Firestore sync (1s)
      syncPositionToFirestore(todoId, pos);
    },
    []
  );

  const handleComplete = useCallback(async (todoId: string) => {
    try {
      await completeTodo(todoId);
      removePositionLocal(todoId);
    } catch (e) {
      console.error("Failed to complete todo from sticky:", e);
    }
  }, []);

  const handleIncrement = useCallback(
    async (todoId: string) => {
      const todo = todos.find((t) => t.id === todoId);
      if (!todo) return;
      try {
        await incrementNumberedTodo(todoId, todo);
        // If it auto-completed, clean up
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
    [todos]
  );

  const handleFullComplete = useCallback(
    async (todoId: string) => {
      const todo = todos.find((t) => t.id === todoId);
      if (!todo) return;
      try {
        await completeNumberedTodoFull(todoId, todo);
        removePositionLocal(todoId);
      } catch (e) {
        console.error("Failed to full-complete todo from sticky:", e);
      }
    },
    [todos]
  );

  if (loading) {
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
