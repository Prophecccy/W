export type TodoType = "standard" | "numbered";
export type TodoStatus = "active" | "done";

export interface NumberedTodoConfig {
  current: number;
  target: number;
}

export interface StickyPosition {
  x: number;
  y: number;
}

export interface Todo {
  id: string;
  uid: string;
  title: string;
  description: string;
  type: TodoType;
  status: TodoStatus;
  color: string;

  // Numbered logic
  numbered?: NumberedTodoConfig;

  // Time & scheduling
  deadline: string | null; // ISO 8601 string or timestamp representation chosen for the app usually (in habits it's often epoch or YYYY-MM-DD. Let's use epoch ms for exact time deadlines, or YYYY-MM-DD. The prompt just says "deadline", "future")
  future: string | null;   // YYYY-MM-DD

  // Widget positioning
  stickyPosition?: StickyPosition;

  // Order
  order: number;

  // Lifecycle
  createdAt: number; // epoch ms
  completedAt: number | null; // epoch ms
}
