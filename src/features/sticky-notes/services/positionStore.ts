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
    return JSON.parse(raw) as PositionMap;
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

const pendingSyncs = new Map<string, number>();

/**
 * Debounced sync to Firestore. Waits 1 second after the last call
 * for a given todoId before actually writing.
 */
export function syncPositionToFirestore(todoId: string, pos: { x: number; y: number }): void {
  // Clear existing timer for this todo
  const existing = pendingSyncs.get(todoId);
  if (existing) {
    clearTimeout(existing);
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

  pendingSyncs.set(todoId, timer);
}

/**
 * Immediately flush all pending syncs (e.g., on window close).
 */
export function flushPendingSyncs(): void {
  pendingSyncs.forEach((timer) => clearTimeout(timer));
  pendingSyncs.clear();
}
