// ─── Undo History Types ──────────────────────────────────────────

export type UndoActionType =
  | "habit_complete"
  | "habit_uncomplete"
  | "todo_create"
  | "todo_delete"
  | "todo_complete"
  | "todo_increment"
  | "strike_added";

export interface UndoAction {
  id: string;
  uid: string;
  type: UndoActionType;
  description: string;
  timestamp: number;
  reverseData: Record<string, unknown>;
}
