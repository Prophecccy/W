import { db, auth, doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, getDocs, limit } from "../../../shared/config/firebase";
import { HabitLog, HabitLogEntry, CompletionEntry } from "../types";
import { getToday } from "../../../shared/utils/dateUtils";
import { addStrike, removeLimiterStrike } from "../../strikes/services/strikeService";
import { calculateLevel } from "../utils/levelEngine";

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

  // Create an empty log for today — notes are NEVER stored in Firestore (local-only)
  const emptyLog: HabitLog = {
    date: today,
    uid: userId,
    habits: {},
  };
  await setDoc(ref, emptyLog);
  return emptyLog;
}

let operationQueue: Promise<any> = Promise.resolve();

export async function completeHabit(
  habitId: string,
  value: number = 1,
  target: number = 1,
  note: string = "",
  resetTimeOverride?: string,
  skipLog = false
): Promise<Record<string, any> | null> {
  const run = () => completeHabitImpl(habitId, value, target, note, resetTimeOverride, skipLog);
  const resultPromise = operationQueue.then(run);
  operationQueue = resultPromise.then(() => {}, () => {});
  return resultPromise;
}

export async function uncompleteHabit(
  habitId: string,
  resetTimeOverride?: string,
  skipLog = false
): Promise<Record<string, any> | null> {
  const run = () => uncompleteHabitImpl(habitId, resetTimeOverride, skipLog);
  const resultPromise = operationQueue.then(run);
  operationQueue = resultPromise.then(() => {}, () => {});
  return resultPromise;
}

async function completeHabitImpl(
  habitId: string,
  value: number = 1,
  target: number = 1,
  note: string = "",
  resetTimeOverride?: string,
  skipLog = false
): Promise<Record<string, any> | null> {
  const userId = uid();

  // Verify if app is frozen
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists() && userSnap.data()?.freeze?.active === true) {
    throw new Error("App is in freeze mode. Habit completion is disabled.");
  }

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

  let isCompleted = false;
  let weeklyResetDay = 1;
  let periodStart = today;
  let prevCumulativeValue = 0;

  if (habit) {
    const period = habit.period || "daily";
    const isPeriodHabit = period === "weekly" || period === "monthly";
    if (isPeriodHabit) {
      if (period === "weekly") {
        const userDocRef = doc(db, "users", userId);
        const userSnap = await getDoc(userDocRef);
        const userData = userSnap.exists() ? userSnap.data() : null;
        weeklyResetDay = userData?.settings?.weeklyResetDay ?? 1;
        periodStart = getWeekStartLocal(today, weeklyResetDay);
      } else {
        periodStart = `${today.substring(0, 7)}-01`;
      }

      const periodLogs = await getLogRange(periodStart, today);
      for (const pl of periodLogs) {
        if (pl.date !== today) {
          prevCumulativeValue += pl.habits?.[habitId]?.value ?? 0;
        }
      }
      const targetVal = habit.type === "standard" ? (habit.frequency || 1) : resolvedTarget;
      isCompleted = habit.type !== "limiter" && (prevCumulativeValue + newValue) >= targetVal;
    } else {
      isCompleted =
        habit.type === "metric"
          ? newValue >= resolvedTarget
          : habit.type === "limiter"
            ? false
            : true;
    }
  } else {
    isCompleted = newValue >= target;
  }

  const newEntry: HabitLogEntry = {
    completed: isCompleted,
    value: newValue,
    target: resolvedTarget,
    completions: [...existing.completions, entry],
  };

  // Write log entry — update nested field if document exists, otherwise initialize document
  if (snap.exists()) {
    await updateDoc(ref, {
      [`habits.${habitId}`]: newEntry,
    });
  } else {
    await setDoc(ref, {
      date: today,
      uid: userId,
      habits: { [habitId]: newEntry },
    });
  }

  // Update habit stats
  let habitTitle = "Limiter";
  let limitExceeded = false;
  let updatesToReturn: Record<string, any> | null = null;

  if (habit) {
    habitTitle = habit.title || "Limiter";
    const period = habit.period || "daily";
    const isPeriodHabit = period === "weekly" || period === "monthly";

    if (isPeriodHabit) {
      const valBefore = prevCumulativeValue + existing.value;
      const valAfter = prevCumulativeValue + newValue;
      const targetVal = habit.type === "standard" ? (habit.frequency || 1) : resolvedTarget;

      const justCompleted = habit.type !== "limiter" && valBefore < targetVal && valAfter >= targetVal;
      const justExceeded = habit.type === "limiter" && valBefore <= targetVal && valAfter > targetVal;

      if (justExceeded) {
        limitExceeded = true;
        const up = {
          currentStreak: 0,
        };
        await updateDoc(habitRef, up);
        updatesToReturn = up;
      } else {
        let updates: Record<string, any> = {};

        if (justCompleted) {
          const newTotal = (habit.totalCompletions || 0) + 1;
          const lvlInfo = calculateLevel(newTotal);
          updates = {
            totalCompletions: newTotal,
            level: lvlInfo.level,
            levelProgress: lvlInfo.progress,
          };

          const lastDate = (habit.lastCompletedDate as string | null) ?? null;
          let currentStreak = habit.currentStreak || 0;
          let longestStreak = habit.longestStreak || 0;

          if (lastDate) {
            let isConsecutive = false;
            let isSamePeriod = false;

            if (period === "weekly") {
              const lastWeekStart = getWeekStartLocal(lastDate, weeklyResetDay);
              const todayWeekStart = getWeekStartLocal(today, weeklyResetDay);
              isSamePeriod = lastWeekStart === todayWeekStart;

              const prevWeekDate = new Date(todayWeekStart + "T12:00:00");
              prevWeekDate.setDate(prevWeekDate.getDate() - 7);
              const prevWeekStartStr = `${prevWeekDate.getFullYear()}-${String(
                prevWeekDate.getMonth() + 1
              ).padStart(2, "0")}-${String(prevWeekDate.getDate()).padStart(2, "0")}`;
              isConsecutive = lastWeekStart === prevWeekStartStr;
            } else {
              // monthly
              const lastY = Number(lastDate.substring(0, 4));
              const lastM = Number(lastDate.substring(5, 7));
              const todayY = Number(today.substring(0, 4));
              const todayM = Number(today.substring(5, 7));

              isSamePeriod = lastY === todayY && lastM === todayM;
              isConsecutive =
                (todayY === lastY && todayM === lastM + 1) ||
                (todayY === lastY + 1 && lastM === 12 && todayM === 1);
            }

            if (isConsecutive) {
              currentStreak += 1;
              if (currentStreak > longestStreak) {
                longestStreak = currentStreak;
              }
            } else if (!isSamePeriod) {
              currentStreak = 1;
            }
          } else {
            currentStreak = 1;
            longestStreak = 1;
          }

          updates.currentStreak = currentStreak;
          updates.longestStreak = longestStreak;
          updates.lastCompletedDate = today;
        }

        if (Object.keys(updates).length > 0) {
          await updateDoc(habitRef, updates);
          updatesToReturn = updates;
        }
      }
    } else {
      // Existing daily/interval logic
      if (isCompleted && !existing.completed) {
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

            if (period === "daily") {
              isConsecutive = diffDays === 1;
              isSamePeriod = diffDays === 0;
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

        const newTotal = (habit.totalCompletions || 0) + 1;
        const lvlInfo = calculateLevel(newTotal);
        const updates = {
          totalCompletions: newTotal,
          lastCompletedDate: today,
          level: lvlInfo.level,
          levelProgress: lvlInfo.progress,
          currentStreak,
          longestStreak,
        };
        await updateDoc(habitRef, updates);
        updatesToReturn = updates;
      } else if (habit.type === "limiter") {
        limitExceeded = existing.value <= resolvedTarget && newValue > resolvedTarget;
        if (limitExceeded) {
          const up = { currentStreak: 0 };
          await updateDoc(habitRef, up);
          updatesToReturn = up;
        }
      }
    }
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

  return updatesToReturn;
}

async function uncompleteHabitImpl(
  habitId: string,
  resetTimeOverride?: string,
  skipLog = false
): Promise<Record<string, any> | null> {
  const userId = uid();

  // Verify if app is frozen
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists() && userSnap.data()?.freeze?.active === true) {
    throw new Error("App is in freeze mode. Habit completion is disabled.");
  }

  const today = getToday(undefined, resetTimeOverride);
  const ref = logRef(userId, today);
  const habitRef = doc(db, "users", userId, "habits", habitId);

  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const log = snap.data() as HabitLog;
  const existing = log.habits?.[habitId];
  if (!existing || existing.completions.length === 0) return null;

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

  let statsUpdate: Record<string, any> = {};

  // ── Sync habit document stats (Rollback) ────────────────────────
  try {
    if (habit) {
      if (habit.type === "limiter") {
        if (existing.value > existing.target && newValue <= existing.target) {
          try {
            await removeLimiterStrike(habitId);
          } catch (err) {
            console.error("Failed to remove limiter strike on uncomplete:", err);
          }
        }
      } else {
        const newTotal = Math.max(0, (habit.totalCompletions || 0) - 1);
        const lvlInfo = calculateLevel(newTotal);
        statsUpdate = {
          totalCompletions: newTotal,
          level: lvlInfo.level,
          levelProgress: lvlInfo.progress,
        };

        const period = habit.period || "daily";
        const isPeriodHabit = period === "weekly" || period === "monthly";

        if (isPeriodHabit) {
          let periodStart = today;
          let weeklyResetDay = 1;
          if (period === "weekly") {
            const userDocRef = doc(db, "users", userId);
            const userSnap = await getDoc(userDocRef);
            const userData = userSnap.exists() ? userSnap.data() : null;
            weeklyResetDay = userData?.settings?.weeklyResetDay ?? 1;
            periodStart = getWeekStartLocal(today, weeklyResetDay);
          } else {
            periodStart = `${today.substring(0, 7)}-01`;
          }

          const periodLogs = await getLogRange(periodStart, today);
          let valAfter = 0;
          for (const pl of periodLogs) {
            valAfter += pl.habits?.[habitId]?.value ?? 0;
          }
          const valBefore = valAfter + lastValue;
          const targetVal = habit.type === "standard" ? (habit.frequency || 1) : existing.target;
          const justDropped = valBefore >= targetVal && valAfter < targetVal;

          if (justDropped) {
            statsUpdate.currentStreak = Math.max(0, (habit.currentStreak || 0) - 1);
            let prevCompletedDate: string | null = null;
            try {
              const logsRef = collection(db, "users", userId, "logs");
              const prevLogsQuery = query(
                logsRef,
                where("date", "<", today),
                orderBy("date", "desc"),
                limit(40)
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
              console.warn("Failed to find previous completion date:", err);
            }
            statsUpdate.lastCompletedDate = prevCompletedDate;
          }
        } else {
          // If it transitioned from completed to uncompleted
          if (existing.completed && !isCompleted) {
            // Query historical logs to restore the actual previous completion date and recalculate the streak
            let prevCompletedDate: string | null = null;
            let calculatedStreak = 0;
            try {
              const { collection, query, where, orderBy, getDocs } = await import("../../../shared/config/firebase");
              const logsRef = collection(db, "users", userId, "logs");
              const prevLogsQuery = query(
                logsRef,
                where("date", "<", today),
                orderBy("date", "desc"),
                limit(40)
              );
              const prevLogsSnap = await getDocs(prevLogsQuery);
              
              const completedDates: string[] = [];
              for (const d of prevLogsSnap.docs) {
                const l = d.data();
                if (l.habits?.[habitId]?.completed) {
                  completedDates.push(l.date);
                }
              }

              if (completedDates.length > 0) {
                prevCompletedDate = completedDates[0];

                const userDocRef = doc(db, "users", userId);
                const userSnap = await getDoc(userDocRef);
                const userData = userSnap.exists() ? userSnap.data() : null;
                const weeklyResetDay = userData?.settings?.weeklyResetDay ?? 1;

                const period = habit.period || "daily";
                const intervalDays = habit.intervalDays || 2;

                // Check if the previous completion is consecutive with today
                if (isConsecutiveDates(today, prevCompletedDate, period, weeklyResetDay, intervalDays)) {
                  calculatedStreak = 1;

                  let currentRefDate = prevCompletedDate;

                  for (let i = 1; i < completedDates.length; i++) {
                    const date2 = completedDates[i];
                    
                    // Skip same period completion
                    if (isSamePeriodDates(currentRefDate, date2, period, weeklyResetDay)) {
                      continue;
                    }

                    // Check if consecutive
                    if (isConsecutiveDates(currentRefDate, date2, period, weeklyResetDay, intervalDays)) {
                      calculatedStreak++;
                      currentRefDate = date2;
                    } else {
                      break;
                    }
                  }
                } else {
                  calculatedStreak = 0;
                }
              }
            } catch (err) {
              console.warn("[uncompleteHabit] Failed to restore previous completion date/streak:", err);
            }
            statsUpdate.lastCompletedDate = prevCompletedDate;
            statsUpdate.currentStreak = calculatedStreak;
          }
        }
      }

      if (Object.keys(statsUpdate).length > 0) {
        await updateDoc(habitRef, statsUpdate);
      }
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

  return statsUpdate;
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

// ─── SECURITY: updateNote() and getNoteHistory() DELETED ─────────
// Daily notes are stored EXCLUSIVELY in local IndexedDB and synced
// to the user's personal Google Drive. They NEVER touch Firestore.
// See: localLogService.ts → saveLocalNote()
// See: googleDriveService.ts → syncNoteToDrive()

// ─── Helpers ────────────────────────────────────────────────────
function getWeekStartLocal(dateStr: string, weekStartDay: number): string {
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr;
  let safety = 0;
  while (d.getDay() !== weekStartDay && safety < 10) {
    d.setDate(d.getDate() - 1);
    safety++;
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSamePeriodDates(date1: string, date2: string, period: string, weeklyResetDay: number): boolean {
  const d1 = new Date(date1 + "T00:00:00");
  const d2 = new Date(date2 + "T00:00:00");
  const diffDays = Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return true;

  if (period === "daily") {
    return false;
  } else if (period === "weekly") {
    const w1 = getWeekStartLocal(date1, weeklyResetDay);
    const w2 = getWeekStartLocal(date2, weeklyResetDay);
    return w1 === w2;
  } else if (period === "monthly") {
    const y1 = Number(date1.substring(0, 4));
    const m1 = Number(date1.substring(5, 7));
    const y2 = Number(date2.substring(0, 4));
    const m2 = Number(date2.substring(5, 7));
    return y1 === y2 && m1 === m2;
  } else if (period === "interval") {
    return false;
  }
  return false;
}

function isConsecutiveDates(
  date1: string,
  date2: string,
  period: string,
  weeklyResetDay: number,
  intervalDays: number = 2
): boolean {
  const d1 = new Date(date1 + "T00:00:00");
  const d2 = new Date(date2 + "T00:00:00");
  const diffDays = Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return false;

  if (period === "daily") {
    return diffDays === 1;
  } else if (period === "weekly") {
    const w1 = getWeekStartLocal(date1, weeklyResetDay);
    const w2 = getWeekStartLocal(date2, weeklyResetDay);
    if (w1 === w2) return false;

    const prevWeekDate = new Date(w1 + "T12:00:00");
    prevWeekDate.setDate(prevWeekDate.getDate() - 7);
    const prevWeekStartStr = `${prevWeekDate.getFullYear()}-${String(
      prevWeekDate.getMonth() + 1
    ).padStart(2, "0")}-${String(prevWeekDate.getDate()).padStart(2, "0")}`;
    return w2 === prevWeekStartStr;
  } else if (period === "monthly") {
    const y1 = Number(date1.substring(0, 4));
    const m1 = Number(date1.substring(5, 7));
    const y2 = Number(date2.substring(0, 4));
    const m2 = Number(date2.substring(5, 7));

    if (y1 === y2 && m1 === m2) return false;
    return (y1 === y2 && m1 === m2 + 1) || (y1 === y2 + 1 && m2 === 12 && m1 === 1);
  } else if (period === "interval") {
    return diffDays <= intervalDays;
  }
  return false;
}
