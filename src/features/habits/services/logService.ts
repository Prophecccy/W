import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  runTransaction,
} from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { HabitLog, HabitLogEntry, CompletionEntry } from "../types";
import { getToday } from "../../../shared/utils/dateUtils";
import { saveLocalNote } from "../../logs/services/localLogService";
import { addStrike, removeLimiterStrike } from "../../strikes/services/strikeService";

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}

function logRef(userId: string, date: string) {
  return doc(db, "users", userId, "logs", date);
}

// ─── Get / create today's log ────────────────────────────────────

export async function getTodayLog(): Promise<HabitLog> {
  const userId = uid();
  const today = getToday();
  const ref = logRef(userId, today);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data() as HabitLog;
  }

  // Create an empty log for today
  const emptyLog: HabitLog = {
    date: today,
    uid: userId,
    notes: "",
    habits: {},
  };
  await setDoc(ref, emptyLog);
  return emptyLog;
}

// ─── Complete a habit ────────────────────────────────────────────

export async function completeHabit(
  habitId: string,
  value: number = 1,
  target: number = 1,
  note: string = ""
): Promise<void> {
  const userId = uid();
  const today = getToday();
  const ref = logRef(userId, today);
  const habitRef = doc(db, "users", userId, "habits", habitId);

  const result = await runTransaction(db, async (transaction) => {
    const habitSnap = await transaction.get(habitRef);
    const habit = habitSnap.exists() ? habitSnap.data() : null;
    const resolvedTarget = habit?.metric?.targetValue ?? target;

    const snap = await transaction.get(ref);
    const log = snap.exists() ? (snap.data() as HabitLog) : null;

    const existing: HabitLogEntry = log?.habits?.[habitId] ?? {
      completed: false,
      value: 0,
      target: resolvedTarget,
      completions: [],
    };

    const entry: CompletionEntry = {
      timestamp: Date.now(),
      value,
      ...(note ? { note } : {}),
    };

    const newValue = existing.value + value;
    const isCompleted =
      habit?.type === "metric"
        ? newValue >= resolvedTarget
        : habit?.type === "limiter"
          ? false
          : true;

    const newEntry: HabitLogEntry = {
      completed: isCompleted,
      value: newValue,
      target: resolvedTarget,
      completions: [...existing.completions, entry],
    };

    if (!snap.exists()) {
      transaction.set(ref, {
        date: today,
        uid: userId,
        notes: "",
        habits: { [habitId]: newEntry },
      });
    } else {
      transaction.update(ref, {
        [`habits.${habitId}`]: newEntry,
      });
    }

    let habitTitle = "Limiter";
    let limitExceeded = false;

    if (habit) {
      habitTitle = habit.title || "Limiter";
      limitExceeded = habit.type === "limiter" && newValue > resolvedTarget;

      const lastDate = (habit.lastCompletedDate as string | null) ?? null;
      let currentStreak = habit.currentStreak || 0;
      let longestStreak = habit.longestStreak || 0;

      if (lastDate) {
        const last = new Date(lastDate + "T00:00:00");
        const now = new Date(today + "T00:00:00");
        const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          currentStreak += 1;
          if (currentStreak > longestStreak) {
            longestStreak = currentStreak;
          }
        } else if (diffDays > 1) {
          currentStreak = 1;
        }
      } else {
        currentStreak = 1;
        longestStreak = 1;
      }

      transaction.update(habitRef, {
        totalCompletions: (habit.totalCompletions || 0) + 1,
        lastCompletedDate: today,
        levelProgress: (habit.levelProgress || 0) + 1,
        currentStreak,
        longestStreak,
      });
    }

    return { limitExceeded, habitTitle };
  });

  // ─── Limiter Exceeded Strike Logic ──────────────────────────────
  if (result.limitExceeded) {
    try {
      await addStrike(habitId, result.habitTitle, "limiter_exceeded");
    } catch (e) {
      console.error("Failed to add limiter strike:", e);
    }
  }
}

// ─── Uncomplete a habit (undo) ───────────────────────────────────

export async function uncompleteHabit(habitId: string): Promise<void> {
  const userId = uid();
  const today = getToday();
  const ref = logRef(userId, today);
  const habitRef = doc(db, "users", userId, "habits", habitId);

  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const log = snap.data() as HabitLog;
  const existing = log.habits?.[habitId];
  if (!existing || existing.completions.length === 0) return;

  const habitSnap = await getDoc(habitRef);
  const habit = habitSnap.exists() ? habitSnap.data() : null;

  // Remove last completion
  const newCompletions = existing.completions.slice(0, -1);
  const lastValue = existing.completions[existing.completions.length - 1].value;
  const newValue = Math.max(0, existing.value - lastValue);

  const isCompleted =
    habit?.type === "metric"
      ? newValue >= existing.target
      : habit?.type === "limiter"
        ? false
        : newCompletions.length > 0;

  const newEntry: HabitLogEntry = {
    ...existing,
    completed: isCompleted,
    value: newValue,
    completions: newCompletions,
  };

  await updateDoc(ref, {
    [`habits.${habitId}`]: newEntry,
  });

  // ── Sync habit document stats (Rollback) ────────────────────────
  try {
    if (habit) {
      let statsUpdate: Record<string, any> = {
        totalCompletions: Math.max(0, (habit.totalCompletions || 0) - 1),
        levelProgress: Math.max(0, (habit.levelProgress || 0) - 1),
      };

      // If it transitioned from completed to uncompleted
      if (existing.completed && !isCompleted) {
        statsUpdate.currentStreak = Math.max(0, (habit.currentStreak || 0) - 1);
        statsUpdate.lastCompletedDate = null; // Revert to uncompleted state
      }

      await updateDoc(habitRef, statsUpdate);
    }
  } catch (e) {
    console.error("Failed to sync habit stats on undo:", e);
  }

  // ─── Limiter Undo Strike Logic ──────────────────────────────────
  if (habit?.type === "limiter" && existing.value > existing.target) {
    try {
      await removeLimiterStrike(habitId);
    } catch (e) {
      console.error("Failed to revert limiter strike:", e);
    }
  }
}

// ─── Log range (for analytics) ────────────────────────────────────

export async function getLogRange(
  startDate: string,
  endDate: string
): Promise<HabitLog[]> {
  const userId = uid();
  const logsRef = collection(db, "users", userId, "logs");
  const q = query(
    logsRef,
    where("date", ">=", startDate),
    where("date", "<=", endDate),
    orderBy("date", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as HabitLog);
}

// ─── Update Daily Note ───────────────────────────────────────────

export async function updateNote(notes: string): Promise<void> {
  const today = getToday();
  await saveLocalNote(today, notes);
}

// ─── Get Note History ────────────────────────────────────────────

export async function getNoteHistory(userId: string): Promise<HabitLog[]> {
  const logsRef = collection(db, "users", userId, "logs");
  const q = query(
    logsRef,
    where("notes", "!=", "")
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as HabitLog)
    .sort((a, b) => b.date.localeCompare(a.date));
}
