import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { UndoAction, UndoActionType } from "./undoTypes";
import { uncompleteHabit, completeHabit } from "../../habits/services/logService";
import { deleteTodo } from "../../todos/services/todoService";

// ─── Helpers ────────────────────────────────────────────────────

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}

function undoRef() {
  return collection(db, "users", uid(), "undoHistory");
}

// ─── Log an action ──────────────────────────────────────────────

export async function logAction(
  type: UndoActionType,
  description: string,
  reverseData: Record<string, unknown>
): Promise<string> {
  const action: Omit<UndoAction, "id"> = {
    uid: uid(),
    type,
    description,
    timestamp: Date.now(),
    reverseData,
  };
  const ref = await addDoc(undoRef(), action);
  return ref.id;
}

// ─── Get history ────────────────────────────────────────────────

export async function getHistory(days: number = 7): Promise<UndoAction[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const q = query(
    undoRef(),
    where("timestamp", ">=", cutoff),
    orderBy("timestamp", "desc"),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as UndoAction));
}

// ─── Undo an action ─────────────────────────────────────────────

export async function undoAction(actionId: string): Promise<void> {
  const actions = await getHistory(7);
  const action = actions.find((a) => a.id === actionId);
  if (!action) throw new Error("Action not found or expired");

  // Execute the reverse operation based on action type
  switch (action.type) {
    case "habit_complete": {
      // Reverse: uncomplete the habit
      const habitId = action.reverseData.habitId as string;
      await uncompleteHabit(habitId);
      break;
    }
    case "habit_uncomplete": {
      // Reverse: re-complete the habit
      const habitId = action.reverseData.habitId as string;
      const value = (action.reverseData.value as number) ?? 1;
      const target = (action.reverseData.target as number) ?? 1;
      await completeHabit(habitId, value, target);
      break;
    }
    case "todo_create": {
      // Reverse: delete the todo that was created
      const todoId = action.reverseData.todoId as string;
      await deleteTodo(todoId);
      break;
    }
    case "todo_complete": {
      // Reverse: mark todo back as active
      // We import updateTodo dynamically to avoid circular deps
      const { updateTodo } = await import("../../todos/services/todoService");
      const todoId = action.reverseData.todoId as string;
      await updateTodo(todoId, { status: "active", completedAt: null });
      break;
    }
    case "todo_delete": {
      // Reverse: re-create the todo (if reverseData contains the full todo)
      const { createTodo } = await import("../../todos/services/todoService");
      const todoData = action.reverseData.todoData as Record<string, unknown>;
      if (todoData) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, uid: _uid, createdAt, status, completedAt, ...rest } = todoData;
        await createTodo(rest as any);
      }
      break;
    }
    case "strike_added": {
      // Strikes are generally not reversible from undo history,
      // but we log them for visibility. Show as non-undoable.
      throw new Error("Strike additions cannot be undone from history");
    }
  }

  // Remove the undo entry after successful reversal
  await deleteDoc(doc(db, "users", uid(), "undoHistory", actionId));
}

// ─── Purge old entries (7-day retention) ─────────────────────────

export async function purgeOldEntries(): Promise<number> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const q = query(
    undoRef(),
    where("timestamp", "<", cutoff),
    limit(50)
  );
  const snap = await getDocs(q);
  let deleted = 0;
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
    deleted++;
  }
  return deleted;
}
