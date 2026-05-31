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

export async function getTodayLog(resetTimeOverride?: string): Promise<HabitLog> {
  const userId = uid();
  const today = getToday(undefined, resetTimeOverride);
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

export async function completeHabit(
  habitId: string,
  value: number = 1,
  target: number = 1,
  note: string = "",
  resetTimeOverride?: string,
  skipLog = false
): Promise<void> {
  const userId = uid();
  const today = getToday(undefined, resetTimeOverride);
  const ref = logRef(userId, today);
  const habitRef = doc(db, "users", userId, "habits", habitId);

  // Read current state (will use cache if offline)
  const [habitSnap, snap] = await Promise.all([
    getDoc(habitRef),
    getDoc(ref),
  ]);

  const habit = habitSnap.exists() ? habitSnap.data() : null;
  const resolvedTarget = habit?.metric?.targetValue ?? target;
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

  // Write log entry — setDoc with merge: true is concurrent-safe and prevents overwriting
  await setDoc(
    ref,
    {
      date: today,
      uid: userId,
      habits: { [habitId]: newEntry },
    },
    { merge: true }
  );

  // Update habit stats
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

      if (diffDays > 0) {
        let isConsecutive = false;
        let isSamePeriod = false;

        const period = habit.period || "daily";

        if (period === "daily") {
          isConsecutive = diffDays === 1;
          isSamePeriod = diffDays === 0;
        } else if (period === "weekly") {
          const userDocRef = doc(db, "users", userId);
          const userSnap = await getDoc(userDocRef);
          const userData = userSnap.exists() ? userSnap.data() : null;
          const weeklyResetDay = userData?.settings?.weeklyResetDay ?? 1;

          const lastWeekStart = getWeekStartLocal(lastDate, weeklyResetDay);
          const todayWeekStart = getWeekStartLocal(today, weeklyResetDay);
          
          isSamePeriod = lastWeekStart === todayWeekStart;
          
          const prevWeekDate = new Date(todayWeekStart + "T12:00:00");
          prevWeekDate.setDate(prevWeekDate.getDate() - 7);
          const prevWeekStartStr = `${prevWeekDate.getFullYear()}-${String(prevWeekDate.getMonth() + 1).padStart(2, '0')}-${String(prevWeekDate.getDate()).padStart(2, '0')}`;
          
          isConsecutive = lastWeekStart === prevWeekStartStr;
        } else if (period === "monthly") {
          const lastY = Number(lastDate.substring(0, 4));
          const lastM = Number(lastDate.substring(5, 7));
          const todayY = Number(today.substring(0, 4));
          const todayM = Number(today.substring(5, 7));
          
          isSamePeriod = lastY === todayY && lastM === todayM;
          isConsecutive = (todayY === lastY && todayM === lastM + 1) || 
                          (todayY === lastY + 1 && lastM === 12 && todayM === 1);
        } else if (period === "interval") {
          const intervalDays = habit.intervalDays || 2;
          isSamePeriod = diffDays === 0;
          isConsecutive = diffDays <= intervalDays;
        }

        if (isConsecutive) {
          currentStreak += 1;
          if (currentStreak > longestStreak) {
            longestStreak = currentStreak;
          }
        } else if (!isSamePeriod) {
          currentStreak = 1;
        }
      }
    } else {
      currentStreak = 1;
      longestStreak = 1;
    }

    await updateDoc(habitRef, {
      totalCompletions: (habit.totalCompletions || 0) + 1,
      lastCompletedDate: today,
      levelProgress: (habit.levelProgress || 0) + 1,
      currentStreak,
      longestStreak,
    });
  }

  // Log to undo history
  if (!skipLog) {
    try {
      const { logAction } = await import("../../settings/services/undoService");
      await logAction("habit_complete", `[ HABIT COMPLETED ] - ${habitTitle}`, {
        habitId,
        value,
        target: resolvedTarget,
      });
    } catch (err) {
      console.error("Failed to log habit_complete:", err);
    }
  }

  // ─── Limiter Exceeded Strike Logic ──────────────────────────────
  if (limitExceeded) {
    try {
      await addStrike(habitId, habitTitle, "limiter_exceeded");
    } catch (e) {
      console.error("Failed to add limiter strike:", e);
    }
  }
}

export async function uncompleteHabit(
  habitId: string,
  resetTimeOverride?: string,
  skipLog = false
): Promise<void> {
  const userId = uid();
  const today = getToday(undefined, resetTimeOverride);
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
        
        // BUG 10: Query historical logs to restore the actual previous completion date
        let prevCompletedDate: string | null = null;
        try {
          const { collection, query, where, orderBy, getDocs } = await import("firebase/firestore");
          const logsRef = collection(db, "users", userId, "logs");
          const prevLogsQuery = query(
            logsRef,
            where("date", "<", today),
            orderBy("date", "desc")
          );
          const prevLogsSnap = await getDocs(prevLogsQuery);
          for (const d of prevLogsSnap.docs) {
            const l = d.data();
            if (l.habits?.[habitId]?.completed) {
              prevCompletedDate = l.date;
              break;
            }
          }
        } catch (err) {
          console.warn("[uncompleteHabit] Failed to restore previous completion date:", err);
        }
        statsUpdate.lastCompletedDate = prevCompletedDate;
      }

      await updateDoc(habitRef, statsUpdate);
    }
  } catch (e) {
    console.error("Failed to sync habit stats on undo:", e);
  }

  // Log to undo history
  if (!skipLog) {
    try {
      const { logAction } = await import("../../settings/services/undoService");
      await logAction("habit_uncomplete", `[ HABIT UNDONE ] - ${habit?.title || "Habit"}`, {
        habitId,
        value: lastValue,
        target: existing.target,
      });
    } catch (err) {
      console.error("Failed to log habit_uncomplete:", err);
    }
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

// ─── Helpers ────────────────────────────────────────────────────
function getWeekStartLocal(dateStr: string, weekStartDay: number): string {
  const d = new Date(dateStr + "T12:00:00");
  while (d.getDay() !== weekStartDay) {
    d.setDate(d.getDate() - 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
