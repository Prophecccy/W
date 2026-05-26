import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { FreezeState, FreezeHistoryEntry, FreezeReason, AUTO_FREEZE_THRESHOLD_DAYS } from "../types";
import { getToday, formatDate } from "../../../shared/utils/dateUtils";

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}

function userRef(userId: string) {
  return doc(db, "users", userId);
}

// ─── Default state ───────────────────────────────────────────────

const DEFAULT_FREEZE: FreezeState = {
  active: false,
  startDate: null,
  endDate: null,
  reason: null,
  lastInteractionDate: getToday(),
  history: [],
};

// ─── Read ────────────────────────────────────────────────────────

export async function getFreezeState(): Promise<FreezeState> {
  const userId = uid();
  const snap = await getDoc(userRef(userId));
  if (!snap.exists()) throw new Error("User doc not found");
  const data = snap.data();
  const raw = (data.freeze ?? { ...DEFAULT_FREEZE, lastInteractionDate: data.lastActiveDate ?? getToday() }) as FreezeState;
  // Ensure history is always an array (Firestore may omit it on first activation)
  if (!Array.isArray(raw.history)) {
    raw.history = [];
  }
  return raw;
}

export async function isCurrentlyFrozen(): Promise<boolean> {
  const freeze = await getFreezeState();
  return freeze.active;
}

// ─── Activate ────────────────────────────────────────────────────

export async function activateFreeze(
  reason: FreezeReason,
  startDate?: string
): Promise<void> {
  const userId = uid();
  const effectiveStart = startDate ?? getToday();

  await updateDoc(userRef(userId), {
    "freeze.active": true,
    "freeze.startDate": effectiveStart,
    "freeze.endDate": null,
    "freeze.reason": reason,
  });
}

// ─── Deactivate ──────────────────────────────────────────────────

export async function deactivateFreeze(): Promise<void> {
  const userId = uid();
  const freeze = await getFreezeState();

  if (!freeze.active || !freeze.startDate) return;

  const today = getToday();

  // Calculate days frozen
  const start = new Date(freeze.startDate + "T12:00:00");
  const end = new Date(today + "T12:00:00");
  const daysCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  const historyEntry: FreezeHistoryEntry = {
    startDate: freeze.startDate,
    endDate: today,
    reason: freeze.reason ?? "manual",
    daysCount,
  };

  await updateDoc(userRef(userId), {
    "freeze.active": false,
    "freeze.startDate": null,
    "freeze.endDate": null,
    "freeze.reason": null,
    "freeze.lastInteractionDate": today,
    "freeze.history": arrayUnion(historyEntry),
  });
}

// ─── Auto-Freeze Detection ──────────────────────────────────────

/**
 * Checks if the user has been absent for ≥ AUTO_FREEZE_THRESHOLD_DAYS.
 * If so, retroactively activates freeze starting from `lastInteractionDate + 1`.
 *
 * Returns { triggered, frozenSince } so the UI can show WelcomeBack.
 */
export async function checkAutoFreeze(
  lastInteractionDate: string,
  today: string
): Promise<{ triggered: boolean; frozenSince: string | null }> {
  if (!lastInteractionDate || !today || lastInteractionDate === "Invalid Date" || today === "Invalid Date") {
    return { triggered: false, frozenSince: null };
  }

  const lastDate = new Date(lastInteractionDate + "T12:00:00");
  const todayDate = new Date(today + "T12:00:00");
  if (isNaN(lastDate.getTime()) || isNaN(todayDate.getTime())) {
    return { triggered: false, frozenSince: null };
  }

  const gapDays = Math.round(
    (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (gapDays < AUTO_FREEZE_THRESHOLD_DAYS) {
    return { triggered: false, frozenSince: null };
  }

  // Auto-freeze retroactively: freeze started the day after last interaction
  const freezeStart = new Date(lastDate);
  freezeStart.setDate(freezeStart.getDate() + 1);
  const frozenSince = formatDate(freezeStart);

  await activateFreeze("auto_absence", frozenSince);

  return { triggered: true, frozenSince };
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Given a freeze state, check if a specific date falls within the frozen range.
 * Used by the gap processor to skip penalties.
 */
export function isDateFrozen(
  freeze: FreezeState,
  dateStr: string
): boolean {
  if (!freeze || !freeze.active || !freeze.startDate) return false;
  // Active freeze: any date >= startDate is frozen
  return dateStr >= freeze.startDate;
}

/**
 * Check frozen ranges from history + active range for a specific date.
 */
export function isDateInFreezeRange(
  freeze: FreezeState,
  dateStr: string
): boolean {
  if (!freeze) return false;
  // Check active freeze
  if (freeze.active && freeze.startDate && dateStr >= freeze.startDate) {
    return true;
  }

  // Check historical freeze entries
  for (const entry of (freeze.history ?? [])) {
    if (dateStr >= entry.startDate && dateStr <= entry.endDate) {
      return true;
    }
  }

  return false;
}

// ─── Update interaction date ─────────────────────────────────────

export async function updateInteractionDate(): Promise<void> {
  const userId = uid();
  const today = getToday();
  await updateDoc(userRef(userId), {
    "freeze.lastInteractionDate": today,
  });
}
