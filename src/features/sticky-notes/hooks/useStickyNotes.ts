import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { Todo } from "../../todos/types";
import { loadPositions, savePositionLocal } from "../services/positionStore";

interface StickyNotesReturn {
  todos: Todo[];
  positions: Record<string, { x: number; y: number }>;
  loading: boolean;
}

/**
 * Real-time listener on active todos that have stickyPosition defined.
 * On mount: loads local position cache first (instant render),
 * then overwrites with Firestore data as it arrives.
 */
export function useStickyNotes(): StickyNotesReturn {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
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

        // Only include todos that have a stickyPosition (opted into desktop display)
        if (todo.stickyPosition) {
          activeTodos.push(todo);

          // Prefer Firestore position over local cache
          firestorePositions[todo.id] = todo.stickyPosition;

          // Also update local cache with Firestore values
          savePositionLocal(todo.id, todo.stickyPosition);
        }
      });

      setTodos(activeTodos);

      // Merge: Firestore positions take priority, local cache fills gaps
      setPositions((prev) => ({
        ...prev,
        ...firestorePositions,
      }));

      setLoading(false);
    });

    return unsub;
  }, []);

  return { todos, positions, loading };
}
