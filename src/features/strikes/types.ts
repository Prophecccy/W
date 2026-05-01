// ─── Strike State Machine ────────────────────────────────────────
// 0–4 strikes = normal operation
// 5 strikes  = LOCKOUT → must resolve via punishment

export interface StrikeHistoryEntry {
  habitId: string;
  habitTitle: string;
  reason: "missed" | "manual" | "lockdown_violation";
  date: string;        // YYYY-MM-DD
  timestamp: number;   // Date.now()
}

export interface StrikeState {
  current: number;         // 0–5 (5 = locked)
  total: number;           // lifetime counter
  lastStrikeDate: string | null;
  history: StrikeHistoryEntry[];
}

export type PunishmentChoice =
  | "increase_difficulty"   // +1/3 of target on a chosen habit
  | "add_habit"             // must create a new habit
  | "add_todo";             // must create a new todo

export interface PunishmentOption {
  id: PunishmentChoice;
  title: string;
  description: string;
  icon: string;           // Lucide icon name
}

export const PUNISHMENT_OPTIONS: PunishmentOption[] = [
  {
    id: "increase_difficulty",
    title: "[ INCREASE DIFFICULTY ]",
    description: "Raise the target of one habit by 33%",
    icon: "TrendingUp",
  },
  {
    id: "add_habit",
    title: "[ ADD NEW HABIT ]",
    description: "Create a new daily habit as penance",
    icon: "Plus",
  },
  {
    id: "add_todo",
    title: "[ ADD NEW TODO ]",
    description: "Create a new task that must be completed",
    icon: "ListPlus",
  },
];

export const MAX_STRIKES = 5;
