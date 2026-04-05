// ────────────────────────────────────────────────────────────────
// Habit core types — matching the v1 Firestore schema
// ────────────────────────────────────────────────────────────────

export type HabitPeriod = "daily" | "weekly" | "monthly" | "interval";
export type HabitType = "standard" | "metric" | "limiter";

export interface HabitMetric {
  unit: string; // e.g. "pages", "glasses", "pushups"
  targetValue: number;
  originalTarget: number; // locked at creation for punishment calc
  isTimer: boolean; // true = time-based metric (seconds)
}

export interface HabitDuration {
  type: "continuing" | "endpoint";
  endDate?: string | null; // "YYYY-MM-DD" if endpoint
  completionCount?: number | null; // total reps if endpoint by count
}

export interface Habit {
  id: string;
  uid: string; // owner user ID
  title: string;
  description: string;
  icon: string; // Lucide icon name, e.g. "Dumbbell"
  color: string; // hex accent color
  period: HabitPeriod;
  type: HabitType;

  // Scheduling
  frequency: number; // times per period (e.g. 3x per week)
  daysOfWeek: number[]; // [1,3,5] = Mon/Wed/Fri, for weekly habits
  intervalDays: number; // for interval habits: every N days
  lastCompletedDate: string | null; // "YYYY-MM-DD"

  // Metric / Limiter config
  metric: HabitMetric | null; // null for standard habits

  // Duration
  duration: HabitDuration;

  // Progress tracking
  level: number; // 0–10
  totalCompletions: number;
  levelProgress: number; // completions toward next level (0–threshold)
  currentStreak: number;
  longestStreak: number;

  // Grouping & ordering
  order: number;
  group: string | null; // group ID, null = ungrouped

  // Lifecycle
  isActive: boolean;
  archivedAt: number | null; // epoch ms
  createdAt: number; // epoch ms
}

// ────────────────────────────────────────────────────────────────
// Log types — one document per day at users/{uid}/logs/{YYYY-MM-DD}
// ────────────────────────────────────────────────────────────────

export interface CompletionEntry {
  timestamp: number; // epoch ms
  value: number; // units completed (1 for standard, N for metric)
  note?: string;
}

export interface HabitLogEntry {
  completed: boolean;
  value: number; // total value for the day
  target: number; // target for that day (copied from habit at log time)
  completions: CompletionEntry[]; // individual completion events
  timerSeconds: number; // total timer seconds logged (for timer metrics)
}

export interface HabitLog {
  date: string; // "YYYY-MM-DD"
  uid: string;
  notes: string; // daily note text
  habits: Record<string, HabitLogEntry>; // habitId → entry
}

// ────────────────────────────────────────────────────────────────
// Habit Group
// ────────────────────────────────────────────────────────────────

export interface HabitGroup {
  id: string;
  name: string;
  order: number;
}
