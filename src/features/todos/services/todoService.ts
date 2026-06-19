import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  deleteDoc,
  limit,
  writeBatch
} from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { Todo } from "../types";
import { isTauri } from "../../../shared/utils/tauri";

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}

function todosRef() {
  return collection(db, "users", uid(), "todos");
}

function todoDoc(todoId: string) {
  return doc(db, "users", uid(), "todos", todoId);
}

async function notifyTodoUpdated() {
  if (isTauri()) {
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit("widget-todo-updated");
    } catch (e) {
      console.warn("Failed to emit widget-todo-updated:", e);
    }
  }
}

// ─── CRUD ────────────────────────────────────────────────────────

export async function createTodo(
  todoData: Omit<Todo, "id" | "uid" | "createdAt" | "status" | "completedAt">
): Promise<string> {
  const newRef = doc(todosRef());
  const todo: Todo = {
    ...todoData,
    id: newRef.id,
    uid: uid(),
    status: "active",
    createdAt: Date.now(),
    completedAt: null,
    order: todoData.order || Date.now(),
  };
  await setDoc(newRef, todo);

  // Log to undo history
  try {
    const { logAction } = await import("../../settings/services/undoService");
    await logAction("todo_create", `[ TODO CREATED ] - ${todo.title}`, { todoId: todo.id });
  } catch (err) {
    console.error("Failed to log todo_create:", err);
  }

  await notifyTodoUpdated();
  return todo.id;
}

export async function restoreTodo(todo: Todo): Promise<void> {
  await setDoc(todoDoc(todo.id), todo);
  await notifyTodoUpdated();
}

/** 
 * Fetches all active todos.
 * NOTE: Requires Firestore composite index: status ASC, order ASC
 */
export async function getTodos(): Promise<Todo[]> {
  if (!auth.currentUser) return [];
  const q = query(todosRef(), where("status", "==", "active"), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Todo);
}

/** 
 * Fetches completed todos.
 * NOTE: Requires Firestore composite index: status ASC, completedAt DESC
 */
export async function getCompletedTodos(): Promise<Todo[]> {
  if (!auth.currentUser) return [];
  const q = query(
    todosRef(),
    where("status", "==", "done"),
    orderBy("completedAt", "desc"),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Todo);
}

export async function updateTodo(todoId: string, updates: Partial<Todo>): Promise<void> {
  // Enforce locked properties (uid, id, createdAt, etc. usually handled by omit at UI, but adding safe types here helps)
  const safeUpdates = { ...updates };
  delete safeUpdates.id;
  delete safeUpdates.uid;
  delete safeUpdates.type; // Type is locked per rules

  await updateDoc(todoDoc(todoId), safeUpdates);
  await notifyTodoUpdated();
}

export async function deleteTodo(todoId: string, skipLog = false): Promise<void> {
  if (!skipLog) {
    let finalTodo: Todo | null = null;
    try {
      const snap = await getDoc(todoDoc(todoId));
      if (snap.exists()) {
        finalTodo = snap.data() as Todo;
      }
    } catch (err) {
      console.warn("Failed to fetch todo before deletion:", err);
    }

    if (finalTodo) {
      try {
        const { logAction } = await import("../../settings/services/undoService");
        await logAction("todo_delete", `[ TODO DELETED ] - ${finalTodo.title}`, {
          todoId: finalTodo.id,
          todoData: finalTodo,
        });
      } catch (err) {
        console.error("Failed to log todo_delete:", err);
      }
    }
  }

  await deleteDoc(todoDoc(todoId));
  await notifyTodoUpdated();
}

export async function completeTodo(todoId: string): Promise<void> {
  let title = "Todo";
  let numbered: any = null;
  try {
    const snap = await getDoc(todoDoc(todoId));
    if (snap.exists()) {
      const data = snap.data() as Todo;
      title = data.title;
      numbered = data.numbered || null;
    }
  } catch (err) {
    console.warn("Failed to fetch todo before completion:", err);
  }

  const updates: any = {
    status: "done",
    completedAt: Date.now(),
  };

  if (numbered) {
    updates.numbered = {
      ...numbered,
      current: numbered.target,
    };
  }

  await updateDoc(todoDoc(todoId), updates);

  // Log to undo history
  try {
    const { logAction } = await import("../../settings/services/undoService");
    await logAction("todo_complete", `[ TODO COMPLETED ] - ${title}`, {
      todoId,
      prevNumbered: numbered,
    });
  } catch (err) {
    console.error("Failed to log todo_complete:", err);
  }

  await purgeOldCompletedTodos();
  await notifyTodoUpdated();
}

// ─── Numbered logic ──────────────────────────────────────────────

export async function incrementNumberedTodo(todoId: string, currentTodo: Todo): Promise<void> {
  if (currentTodo.type !== "numbered" || !currentTodo.numbered) {
    throw new Error("Target todo is not a numbered todo");
  }

  await updateDoc(todoDoc(todoId), {
    "numbered.current": currentTodo.numbered.current,
  });

  await notifyTodoUpdated();
}

export async function completeNumberedTodoFull(todoId: string, currentTodo: Todo): Promise<void> {
  if (currentTodo.type !== "numbered" || !currentTodo.numbered) {
    throw new Error("Target todo is not a numbered todo");
  }

  const prevNumbered = { ...currentTodo.numbered };

  await updateDoc(todoDoc(todoId), {
    "numbered.current": currentTodo.numbered.target,
    status: "done",
    completedAt: Date.now(),
  });

  // Log to undo history
  try {
    const { logAction } = await import("../../settings/services/undoService");
    await logAction("todo_complete", `[ TODO COMPLETED ] - ${currentTodo.title}`, {
      todoId,
      prevNumbered,
    });
  } catch (err) {
    console.error("Failed to log todo_complete:", err);
  }

  await purgeOldCompletedTodos();
  await notifyTodoUpdated();
}

export async function purgeOldCompletedTodos(): Promise<void> {
  if (!auth.currentUser) return;
  try {
    const q = query(
      todosRef(),
      where("status", "==", "done"),
      orderBy("completedAt", "desc")
    );
    const snap = await getDocs(q);
    if (snap.size > 50) {
      const docsToDelete = snap.docs.slice(50);
      const batch = writeBatch(db);
      for (const d of docsToDelete) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
  } catch (err) {
    console.error("Failed to purge old completed todos:", err);
  }
}
