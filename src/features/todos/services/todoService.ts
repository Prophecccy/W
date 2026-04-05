import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  deleteDoc,
  limit
} from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { Todo } from "../types";

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
  };
  await setDoc(newRef, todo);
  return todo.id;
}

export async function getTodos(): Promise<Todo[]> {
  const q = query(todosRef(), where("status", "==", "active"), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Todo);
}

export async function getCompletedTodos(): Promise<Todo[]> {
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
}

export async function deleteTodo(todoId: string): Promise<void> {
  await deleteDoc(todoDoc(todoId));
}

export async function completeTodo(todoId: string): Promise<void> {
  await updateDoc(todoDoc(todoId), {
    status: "done",
    completedAt: Date.now(),
  });
}

// ─── Numbered logic ──────────────────────────────────────────────

export async function incrementNumberedTodo(todoId: string, currentTodo: Todo): Promise<void> {
  if (currentTodo.type !== "numbered" || !currentTodo.numbered) {
    throw new Error("Target todo is not a numbered todo");
  }

  const currentCount = currentTodo.numbered.current;
  const targetCount = currentTodo.numbered.target;
  
  const nextCount = Math.min(currentCount + 1, targetCount);
  
  if (nextCount >= targetCount) {
    // Auto-complete if target reached
    await updateDoc(todoDoc(todoId), {
      "numbered.current": nextCount,
      status: "done",
      completedAt: Date.now(),
    });
  } else {
    // Just increment
    await updateDoc(todoDoc(todoId), {
      "numbered.current": nextCount,
    });
  }
}

export async function completeNumberedTodoFull(todoId: string, currentTodo: Todo): Promise<void> {
  if (currentTodo.type !== "numbered" || !currentTodo.numbered) {
    throw new Error("Target todo is not a numbered todo");
  }

  await updateDoc(todoDoc(todoId), {
    "numbered.current": currentTodo.numbered.target,
    status: "done",
    completedAt: Date.now(),
  });
}
