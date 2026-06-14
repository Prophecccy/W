import { updateTodo } from "../../todos/services/todoService";

// ─── Types ──────────────────────────────────────────────────────

interface PositionMap {
  [todoId: string]: { x: number; y: number };
}

const STORAGE_KEY = "w_sticky_positions";

// ─── Local Storage (fast cache) ─────────────────────────────────
// Using localStorage as the fast local cache since we're in a web context.
// In Tauri production, this persists per-window and survives restarts.

export function loadPositions(): PositionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as PositionMap;
    }
    return {};
  } catch {
    return {};
  }
}

export function savePositionsLocal(positions: PositionMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch (e) {
    console.error("Failed to save sticky positions locally:", e);
  }
}

export function savePositionLocal(todoId: string, pos: { x: number; y: number }): void {
  const positions = loadPositions();
  positions[todoId] = pos;
  savePositionsLocal(positions);
}

export function removePositionLocal(todoId: string): void {
  const positions = loadPositions();
  delete positions[todoId];
  savePositionsLocal(positions);
}

// ─── Firestore Sync (debounced) ─────────────────────────────────

interface PendingSync {
  timer: number;
  pos: { x: number; y: number };
}

const pendingSyncs = new Map<string, PendingSync>();

/**
 * Debounced sync to Firestore. Waits 1 second after the last call
 * for a given todoId before actually writing.
 */
export function syncPositionToFirestore(todoId: string, pos: { x: number; y: number }): void {
  // Clear existing timer for this todo
  const existing = pendingSyncs.get(todoId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  // Set new debounced write
  const timer = window.setTimeout(async () => {
    pendingSyncs.delete(todoId);
    try {
      await updateTodo(todoId, { stickyPosition: pos });
    } catch (e) {
      console.error("Failed to sync sticky position to Firestore:", todoId, e);
    }
  }, 1000);

  pendingSyncs.set(todoId, { timer, pos });
}

/**
 * Immediately flush all pending syncs (e.g., on window close).
 */
export function flushPendingSyncs(): void {
  pendingSyncs.forEach((sync, todoId) => {
    clearTimeout(sync.timer);
    // Write immediately to prevent data loss on close/reload
    updateTodo(todoId, { stickyPosition: sync.pos }).catch((e) => {
      console.error("Failed to flush sticky position to Firestore:", todoId, e);
    });
  });
  pendingSyncs.clear();
}

// Automatically register global unload listener to guarantee persistence
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    flushPendingSyncs();
  });
}
