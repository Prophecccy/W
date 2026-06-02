import { doc, getDoc, updateDoc, runTransaction } from "firebase/firestore";
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

function queueOfflineStrike(strike: { habitId: string; habitTitle: string; reason: string; date: string }) {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem("w_offline_strikes");
    const queue = raw ? JSON.parse(raw) : [];
    const exists = queue.some(
      (s: any) => s.habitId === strike.habitId && s.date === strike.date && s.reason === strike.reason
    );
    if (!exists) {
      queue.push({ ...strike, timestamp: Date.now() });
      localStorage.setItem("w_offline_strikes", JSON.stringify(queue));
      console.info("[strikeService] Queued offline strike:", strike);
    }
  } catch (err) {
    console.error("[strikeService] Failed to queue offline strike:", err);
  }
}

export async function flushOfflineStrikes(): Promise<void> {
  if (typeof localStorage === "undefined" || !navigator.onLine) return;
  try {
    const raw = localStorage.getItem("w_offline_strikes");
    if (!raw) return;
    const queue = JSON.parse(raw);
    if (queue.length === 0) return;

    console.info(`[strikeService] Flushing ${queue.length} offline strikes...`);
    const remaining = [];

    for (const strike of queue) {
      try {
        await addStrike(strike.habitId, strike.habitTitle, strike.reason);
      } catch (err: any) {
        if (err.code === "unavailable" || !navigator.onLine) {
          remaining.push(strike);
        } else {
          console.warn("[strikeService] Discarding un-flushable offline strike:", strike, err);
        }
      }
    }

    if (remaining.length > 0) {
      localStorage.setItem("w_offline_strikes", JSON.stringify(remaining));
    } else {
      localStorage.removeItem("w_offline_strikes");
      console.info("[strikeService] All offline strikes flushed successfully.");
    }
  } catch (err) {
    console.error("[strikeService] Error flushing offline strikes:", err);
  }
}

export async function addStrike(
  habitId: string,
  habitTitle: string,
  reason: "missed" | "manual" | "lockdown_violation" | "snoozed_high_stakes" | "limiter_exceeded" = "missed"
): Promise<StrikeState> {
  const userId = uid();
  const ref = userRef(userId);

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("User doc not found");
      
      const userData = snap.data();
      const resetTime = userData.settings?.dailyResetTime;
      const today = getToday(undefined, resetTime);

      const current = (userData.strikes ?? {
        current: 0,
        total: 0,
        lastStrikeDate: null,
        history: [],
      }) as StrikeState;

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
      const updatedHistory = [...(current.history ?? []), entry];

      transaction.update(ref, {
        "strikes.current": newCurrent,
        "strikes.total": current.total + 1,
        "strikes.lastStrikeDate": today,
        "strikes.history": updatedHistory,
      });

      // Pull user settings for notification
      const settings = userData.settings;
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

      return {
        current: newCurrent,
        total: current.total + 1,
        lastStrikeDate: today,
        history: updatedHistory,
      };
    });
  } catch (err: any) {
    console.error("[strikeService] addStrike transaction failed, checking offline status:", err);
    if (!navigator.onLine || err.code === "unavailable" || err.message?.includes("offline")) {
      const today = getToday();
      queueOfflineStrike({ habitId, habitTitle, reason, date: today });
    }
    throw err;
  }
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
  const ref = userRef(userId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;
    
    const userData = snap.data();
    const resetTime = userData.settings?.dailyResetTime;
    const today = getToday(undefined, resetTime);

    const current = (userData.strikes ?? {
      current: 0,
      total: 0,
      lastStrikeDate: null,
      history: [],
    }) as StrikeState;

    if (current.current === 0) return;

    // Find the last strike in history for this habit on this day with reason "limiter_exceeded"
    const history = Array.isArray(current.history) ? current.history : [];
    const idx = [...history].reverse().findIndex(
      (s) => s.habitId === habitId && s.date === today && s.reason === "limiter_exceeded"
    );

    if (idx === -1) return;

    // Real index in the original history array
    const realIdx = history.length - 1 - idx;
    const newHistory = [...history];
    newHistory.splice(realIdx, 1);

    const newCurrent = Math.max(0, current.current - 1);
    const newTotal = Math.max(0, current.total - 1);

    transaction.update(ref, {
      "strikes.current": newCurrent,
      "strikes.total": newTotal,
      "strikes.history": newHistory,
    });
  });
}

// ─── Query ───────────────────────────────────────────────────────

export async function isLockedOut(): Promise<boolean> {
  const strikes = await getStrikes();
  return strikes.current >= MAX_STRIKES;
}
