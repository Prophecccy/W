import { useState, useEffect, useCallback, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../../../shared/config/firebase";
import { Todo } from "../../todos/types";
import { useAuthContext } from "../../auth/context";
import { loadPositions, savePositionLocal } from "../services/positionStore";
import { getToday } from "../../../shared/utils/dateUtils";

interface StickyNotesReturn {
  todos: Todo[];
  positions: Record<string, { x: number; y: number }>;
  loading: boolean;
  /**
   * Call this BEFORE writing a drag position to Firestore.
   * Suppresses onSnapshot position overwrites for this note ID
   * until the debounced Firestore write has had time to propagate.
   */
  suppressSnapshot: (todoId: string) => void;
}

/**
 * Real-time listener on active todos that have stickyPosition defined.
 * On mount: loads local position cache first (instant render),
 * then overwrites with Firestore data as it arrives.
 *
 * DRAG SUPPRESSION:
 * When a note is dragged, Firestore still has the OLD position until
 * the debounced write completes (~1s). Without suppression, the
 * onSnapshot callback would immediately overwrite the local position
 * with the stale DB value, causing the note to "jerk back".
 *
 * suppressSnapshot(todoId) blocks Firestore position overwrites for
 * that specific note for 3 seconds — enough time for the debounced
 * write (1s) to commit + propagate back via onSnapshot.
 */
export function useStickyNotes(): StickyNotesReturn {
  const { user } = useAuthContext();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [loading, setLoading] = useState(true);

  // IDs currently suppressed from Firestore position overwrites
  const suppressedIdsRef = useRef<Set<string>>(new Set());
  const suppressTimersRef = useRef<Map<string, number>>(new Map());

  const suppressSnapshot = useCallback((todoId: string) => {
    // Clear any existing timer for this ID
    const existing = suppressTimersRef.current.get(todoId);
    if (existing) clearTimeout(existing);

    // Mark as suppressed
    suppressedIdsRef.current.add(todoId);

    // Auto-clear after 3 seconds (debounce write is 1s + network latency)
    const timer = window.setTimeout(() => {
      suppressedIdsRef.current.delete(todoId);
      suppressTimersRef.current.delete(todoId);
    }, 3000);
    suppressTimersRef.current.set(todoId, timer);
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // 1. Load local cache first (instant)
    const cachedPositions = loadPositions();
    setPositions(cachedPositions);

    // 2. Real-time Firestore listener
    const todosRef = collection(db, "users", user.uid, "todos");
    const q = query(todosRef, where("status", "==", "active"));

    const unsub = onSnapshot(q, (snapshot) => {
      const activeTodos: Todo[] = [];
      const firestorePositions: Record<string, { x: number; y: number }> = {};

      snapshot.docs.forEach((doc) => {
        const todo = doc.data() as Todo;
        const localPos = cachedPositions[todo.id];

        // Hide todo if it has expired and is configured to disappear
        const dailyResetTime = localStorage.getItem("w_daily_reset_time") || undefined;
        const todayStr = getToday(undefined, dailyResetTime);
        const isExpiredAndDisappeared = todo.postDeadlineAction === "disappear" && todo.deadline && todo.deadline < todayStr;

        // Include todo if it has a Firestore position OR if we have a cached local position
        if (!isExpiredAndDisappeared && (todo.stickyPosition || localPos)) {
          const finalPos = todo.stickyPosition || localPos || { x: 100, y: 100 };
          activeTodos.push({
            ...todo,
            stickyPosition: finalPos
          });

          // Skip position overwrite for notes being actively dragged.
          // Their local position is authoritative until the DB catches up.
          if (!suppressedIdsRef.current.has(todo.id)) {
            firestorePositions[todo.id] = finalPos;
            // Also update local cache with Firestore values
            savePositionLocal(todo.id, finalPos);
          }
        }
      });

      // Prune old completed/deleted positions from localStorage cache to prevent leaks
      if (!snapshot.metadata.fromCache) {
        const activeIds = new Set(activeTodos.map(t => t.id));
        try {
          const cached = loadPositions();
          let changed = false;
          Object.keys(cached).forEach(id => {
            if (!activeIds.has(id)) {
              delete cached[id];
              changed = true;
            }
          });
          if (changed) {
            localStorage.setItem("w_sticky_positions", JSON.stringify(cached));
          }
        } catch (e) {
          console.error("Failed to prune cached sticky positions:", e);
        }
      }

      setTodos(activeTodos);

      // Merge: Firestore positions take priority (for non-suppressed IDs),
      // local cache fills gaps
      setPositions((prev) => {
        const cleaned: Record<string, { x: number; y: number }> = {};
        activeTodos.forEach((t) => {
          if (firestorePositions[t.id]) {
            cleaned[t.id] = firestorePositions[t.id];
          } else if (prev[t.id]) {
            cleaned[t.id] = prev[t.id];
          }
        });
        return cleaned;
      });

      setLoading(false);
    });

    return () => {
      unsub();
      // Clean up all suppression timers
      suppressTimersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, [user]);

  return { todos, positions, loading, suppressSnapshot };
}
