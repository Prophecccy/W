// ─── Freeze State ────────────────────────────────────────────────
// Freeze pauses the strike system — no penalties accrue while frozen.
// Can be activated manually or auto-triggered after 3+ days absence.

export interface FreezeState {
  active: boolean;
  startDate: string | null;     // "YYYY-MM-DD" when freeze began
  endDate: string | null;       // "YYYY-MM-DD" when freeze ended (null if still active)
  reason: FreezeReason | null;
  lastInteractionDate: string;  // "YYYY-MM-DD" — last date user opened the app
  history: FreezeHistoryEntry[];
}

export type FreezeReason = "manual" | "auto_absence";

export interface FreezeHistoryEntry {
  startDate: string;   // "YYYY-MM-DD"
  endDate: string;     // "YYYY-MM-DD"
  reason: FreezeReason;
  daysCount: number;
}

export const AUTO_FREEZE_THRESHOLD_DAYS = 3;
