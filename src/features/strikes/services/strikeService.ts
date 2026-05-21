import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { StrikeState, StrikeHistoryEntry, MAX_STRIKES } from "../types";
import { getToday } from "../../../shared/utils/dateUtils";

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}

function userRef(userId: string) {
  return doc(db, "users", userId);
}

// ─── Read ────────────────────────────────────────────────────────

export async function getStrikes(): Promise<StrikeState> {
  const userId = uid();
  const snap = await getDoc(userRef(userId));
  if (!snap.exists()) throw new Error("User doc not found");

  const data = snap.data();
  return (data.strikes ?? {
    current: 0,
    total: 0,
    lastStrikeDate: null,
    history: [],
  }) as StrikeState;
}

// ─── Add Strike ──────────────────────────────────────────────────

export async function addStrike(
  habitId: string,
  habitTitle: string,
  reason: "missed" | "manual" | "lockdown_violation" | "snoozed_high_stakes" | "limiter_exceeded" = "missed"
): Promise<StrikeState> {
  const userId = uid();
  const today = getToday();

  const current = await getStrikes();

  // Don't exceed max — they're already locked
  if (current.current >= MAX_STRIKES) return current;

  const entry: StrikeHistoryEntry = {
    habitId,
    habitTitle,
    reason,
    date: today,
    timestamp: Date.now(),
  };

  const newCurrent = Math.min(current.current + 1, MAX_STRIKES);

  await updateDoc(userRef(userId), {
    "strikes.current": newCurrent,
    "strikes.total": current.total + 1,
    "strikes.lastStrikeDate": today,
    "strikes.history": arrayUnion(entry),
  });

  // Pull user settings for notification
  const snap = await getDoc(userRef(userId));
  if (snap.exists()) {
    const settings = snap.data().settings;
    if (settings?.notifications) {
      import("../../../shared/services/notificationService").then(({ sendNotification }) => {
        if (newCurrent === MAX_STRIKES && settings.lockoutAlert) {
          sendNotification(
            "⚠️ APP LOCKED", 
            "You have reached 5 strikes. A punishment is required to regain access."
          );
        } else if ((newCurrent === 3 || newCurrent === 4) && settings.strikeWarnings) {
          sendNotification(
            "🚨 STRIKE WARNING", 
            `You've accrued ${newCurrent}/${MAX_STRIKES} strikes. Be careful!`
          );
        }
      });
    }
  }

  return {
    current: newCurrent,
    total: current.total + 1,
    lastStrikeDate: today,
    history: [...current.history, entry],
  };
}

// ─── Reset (after punishment) ────────────────────────────────────

export async function resetStrikes(): Promise<void> {
  const userId = uid();
  await updateDoc(userRef(userId), {
    "strikes.current": 0,
  });
}

// ─── Remove Limiter Strike (undo) ────────────────────────────────
export async function removeLimiterStrike(habitId: string): Promise<void> {
  const userId = uid();
  const today = getToday();

  const current = await getStrikes();
  if (current.current === 0) return;

  // Find the last strike in history for this habit on this day with reason "limiter_exceeded"
  const idx = [...current.history].reverse().findIndex(
    (s) => s.habitId === habitId && s.date === today && s.reason === "limiter_exceeded"
  );

  if (idx === -1) return;

  // Real index in the original history array
  const realIdx = current.history.length - 1 - idx;
  const newHistory = [...current.history];
  newHistory.splice(realIdx, 1);

  const newCurrent = Math.max(0, current.current - 1);
  const newTotal = Math.max(0, current.total - 1);

  await updateDoc(userRef(userId), {
    "strikes.current": newCurrent,
    "strikes.total": newTotal,
    "strikes.history": newHistory,
  });
}

// ─── Query ───────────────────────────────────────────────────────

export async function isLockedOut(): Promise<boolean> {
  const strikes = await getStrikes();
  return strikes.current >= MAX_STRIKES;
}
