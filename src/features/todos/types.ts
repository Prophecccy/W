export type TodoType = "standard" | "numbered";
export type TodoStatus = "active" | "done";
export type TodoPriority = "p1" | "p2" | "p3" | "p4";

export interface PriorityTierInfo {
  id: TodoPriority;
  label: string;
  shortLabel: string;
  color: string;
  description: string;
}

export const PRIORITY_CONFIG: Record<TodoPriority, PriorityTierInfo> = {
  p1: {
    id: "p1",
    label: "P1 CRITICAL",
    shortLabel: "P1",
    color: "#EF4444",
    description: "Non-negotiable priorities for today. If not done, your day was a failure.",
  },
  p2: {
    id: "p2",
    label: "P2 HIGH",
    shortLabel: "P2",
    color: "#F59E0B",
    description: "Important strategic initiatives that move the needle.",
  },
  p3: {
    id: "p3",
    label: "P3 MEDIUM",
    shortLabel: "P3",
    color: "#5B8DEF",
    description: "Routine daily operations and tasks.",
  },
  p4: {
    id: "p4",
    label: "P4 LOW",
    shortLabel: "P4",
    color: "#6B7280",
    description: "Nice-to-have backlog items or casual ideas.",
  },
};

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
  priority?: TodoPriority;

  // Numbered logic
  numbered?: NumberedTodoConfig;

  // Grouping
  group: string | null;

  // Time & scheduling
  deadline: string | null; // ISO 8601 string or timestamp representation chosen for the app usually (in habits it's often epoch or YYYY-MM-DD. Let's use epoch ms for exact time deadlines, or YYYY-MM-DD. The prompt just says "deadline", "future")
  future: string | null;   // YYYY-MM-DD

  // Widget positioning
  stickyPosition?: StickyPosition;

  // Order
  order: number;

  // Post-deadline configuration
  postDeadlineAction?: "keep" | "disappear";
  strikeIssued?: boolean;

  // Lifecycle
  createdAt: number; // epoch ms
  completedAt: number | null; // epoch ms
}
