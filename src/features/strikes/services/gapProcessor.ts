import { HabitLog } from "../../habits/types";
import { isHabitScheduledToday } from "../../habits/utils/scheduleEngine";
import { addStrike } from "./strikeService";
import { getLogRange } from "../../habits/services/logService";
import { getHabits } from "../../habits/services/habitService";
import { getFreezeState, isDateInFreezeRange, checkAutoFreeze } from "../../freeze/services/freezeService";
import { updateUserDoc, getUserDoc } from "../../auth/services/userService";
import { auth } from "../../../shared/config/firebase";
import { getToday, formatDate } from "../../../shared/utils/dateUtils";

// ─── Gap Processor ──────────────────────────────────────────────
//
// Scans every day between `lastActiveDate + 1` and `yesterday`.
// For each day, checks if each active habit was scheduled.
// If scheduled but not logged → mark as missed → add strike.
//
// Special rules:
//   • Interval habits: only ONE strike per missed due date (tracked
//     by checking the log, not by lastStrikeDate per habit).
//   • Frozen days are skipped entirely — no penalties accrue.
//   • After processing, updates `user.lastActiveDate = today`.
// ────────────────────────────────────────────────────────────────

export interface GapProcessorResult {
  daysProcessed: number;
  missedCount: number;
  strikesAdded: number;
  frozenDaysSkipped: number;
  autoFreezeTriggered: boolean;
  frozenSince: string | null;
}

/**
 * Main entry point. Call after sign-in, before showing dashboard.
 *
 * @param lastActiveDate  YYYY-MM-DD — the last date the user was active
 * @param today           YYYY-MM-DD — defaults to getToday()
 */
export async function processGap(
  lastActiveDate: string,
  today: string = getToday()
): Promise<GapProcessorResult> {
  const result: GapProcessorResult = {
    daysProcessed: 0,
    missedCount: 0,
    strikesAdded: 0,
    frozenDaysSkipped: 0,
    autoFreezeTriggered: false,
    frozenSince: null,
  };

  // If same day or future — nothing to process
  if (lastActiveDate >= today) return result;

  // 1. Check for auto-freeze (≥ 3 day absence)
  const autoFreezeResult = await checkAutoFreeze(lastActiveDate, today);
  if (autoFreezeResult.triggered) {
    result.autoFreezeTriggered = true;
    result.frozenSince = autoFreezeResult.frozenSince;
    // When auto-freeze triggers, all gap days are frozen — no penalties
    // Update lastActiveDate and return so WelcomeBack screen shows
    await updateLastActiveDate(today);
    return result;
  }

  // 2. Fetch freeze state (for manual freezes or historical freeze ranges)
  const freezeState = await getFreezeState();

  // 3. Fetch all active habits
  const habits = await getHabits();
  if (habits.length === 0) {
    await updateLastActiveDate(today);
    return result;
  }

  // Fetch user settings to respect custom weeklyResetDay and dailyResetTime
  let weeklyResetDay = 1;
  let dailyResetTime: string | undefined;
  const u = auth.currentUser;
  if (u) {
    try {
      const userD = await getUserDoc(u.uid);
      if (userD?.settings?.weeklyResetDay !== undefined) {
        weeklyResetDay = userD.settings.weeklyResetDay;
      }
      if (userD?.settings?.dailyResetTime !== undefined) {
        dailyResetTime = userD.settings.dailyResetTime;
      }
    } catch (e) {
      console.warn("[GapProcessor] Failed to fetch user doc for settings:", e);
    }
  }

  // 4. Calculate the date range to process: (lastActiveDate + 1) … yesterday
  const startDate = nextDay(lastActiveDate);
  const yesterday = prevDay(today);

  if (startDate > yesterday) {
    await updateLastActiveDate(today);
    return result;
  }

  // Calculate earliest start date for logs if we have active weekly/monthly metric/limiter habits
  let logFetchStartDate = startDate;
  
  const hasWeeklyMetric = habits.some(
    (h) => h.period === "weekly" && (h.type === "metric" || h.type === "limiter")
  );
  const hasMonthlyMetric = habits.some(
    (h) => h.period === "monthly" && (h.type === "metric" || h.type === "limiter")
  );

  if (hasWeeklyMetric) {
    const weeklyStart = getWeekStart(startDate, weeklyResetDay);
    if (weeklyStart < logFetchStartDate) {
      logFetchStartDate = weeklyStart;
    }
  }
  if (hasMonthlyMetric) {
    const monthlyStart = getMonthStart(startDate);
    if (monthlyStart < logFetchStartDate) {
      logFetchStartDate = monthlyStart;
    }
  }

  // 5. Fetch all logs in the query range (batch read — efficient)
  const logs = await getLogRange(logFetchStartDate, yesterday);
  const logMap = new Map<string, HabitLog>();
  for (const log of logs) {
    logMap.set(log.date, log);
  }

  // 6. Track interval habit strike dates to enforce single-strike-per-due-date
  const intervalStrikeTracker = new Set<string>(); // "habitId:date"

  // 6.5 Fetch active and recently completed todos once before the day-by-day loop
  let activeTodos: any[] = [];
  try {
    const { getTodos, getCompletedTodos } = await import("../../todos/services/todoService");
    const [activeList, completedList] = await Promise.all([
      getTodos(),
      getCompletedTodos()
    ]);
    activeTodos = [...activeList, ...completedList];
  } catch (err) {
    console.error("Failed to fetch todos for gap processor:", err);
  }

  // 7. Day-by-day loop
  let currentDate = new Date(startDate + "T12:00:00");
  const endDate = new Date(yesterday + "T12:00:00");

  while (currentDate <= endDate) {
    const dateStr = formatDate(currentDate);
    result.daysProcessed++;

    // Skip frozen days
    const isFrozen = isDateInFreezeRange(freezeState, dateStr);
    if (isFrozen) {
      result.frozenDaysSkipped++;
    }

    const dayLog = logMap.get(dateStr);

    for (const habit of habits) {
      // Only process habits that existed before this date
      if (habit.createdAt > new Date(dateStr + "T23:59:59").getTime()) {
        continue;
      }

      // Special evaluation for multi-day metric/limiter habits
      const isMultiDayMetric =
        (habit.period === "weekly" || habit.period === "monthly") &&
        (habit.type === "metric" || habit.type === "limiter");

      if (isMultiDayMetric) {
        // BUG 9: Multi-Day Period End Penalty Bypassing via a Single Frozen Day
        // Evaluate multi-day habits on their period end date even if that specific day was frozen.
        let isPeriodEnd = false;
        if (habit.period === "weekly") {
          isPeriodEnd = currentDate.getDay() === (weeklyResetDay === 0 ? 6 : weeklyResetDay - 1);
        } else if (habit.period === "monthly") {
          const next = new Date(currentDate);
          next.setDate(next.getDate() + 1);
          isPeriodEnd = next.getMonth() !== currentDate.getMonth();
        }

        if (!isPeriodEnd) {
          continue;
        }

        // Calculate cumulative progress over the period
        const periodStart =
          habit.period === "weekly"
             ? getWeekStart(dateStr, weeklyResetDay)
             : getMonthStart(dateStr);

        const habitStartStr = habit.startDate || formatDate(new Date(habit.createdAt));
        if (habitStartStr > periodStart) {
          continue;
        }

        // If the entire period was frozen, skip penalties.
        let activeDaysInPeriod = 0;
        let tempDateForFreezeCheck = new Date(periodStart + "T12:00:00");
        const periodEndDForFreezeCheck = new Date(dateStr + "T12:00:00");
        while (tempDateForFreezeCheck <= periodEndDForFreezeCheck) {
          if (!isDateInFreezeRange(freezeState, formatDate(tempDateForFreezeCheck))) {
            activeDaysInPeriod++;
          }
          tempDateForFreezeCheck.setDate(tempDateForFreezeCheck.getDate() + 1);
        }
        if (activeDaysInPeriod === 0) {
          continue;
        }

        let cumulativeValue = 0;
        let tempDate = new Date(periodStart + "T12:00:00");
        const periodEndD = new Date(dateStr + "T12:00:00");
        while (tempDate <= periodEndD) {
          const log = logMap.get(formatDate(tempDate));
          const entry = log?.habits?.[habit.id];
          if (entry) {
            cumulativeValue += entry.value || 0;
          }
          tempDate.setDate(tempDate.getDate() + 1);
        }

        const targetValue = habit.metric?.targetValue ?? 0;
        if (habit.type === "limiter") {
          if (cumulativeValue <= targetValue) continue;
        } else {
          if (cumulativeValue >= targetValue) continue;
        }
      } else {
        // Standard non-multi-day habit evaluation (daily, interval, standard weekly/monthly)
        // Skip entirely if this specific day is frozen
        if (isFrozen) {
          continue;
        }

        // BUG 3: Standard weekly habits without daysOfWeek should only be evaluated on the week's end date
        const isStandardWeeklyAnyday =
          habit.period === "weekly" &&
          habit.type === "standard" &&
          (!habit.daysOfWeek || habit.daysOfWeek.length === 0);

        if (isStandardWeeklyAnyday) {
          const isPeriodEnd = currentDate.getDay() === (weeklyResetDay === 0 ? 6 : weeklyResetDay - 1);
          if (!isPeriodEnd) {
            continue; // Skip evaluation until the end of the week
          }
        }

        // Was this habit scheduled on this day?
        if (!isHabitScheduledToday(habit, dateStr, weeklyResetDay)) {
          continue;
        }

        // Was it completed in the log?
        const logEntry = dayLog?.habits?.[habit.id];
        if (!logEntry && habit.type === "limiter") {
          continue;
        }
        if (logEntry && logEntry.completed) {
          continue;
        }

        // For daily metric/limiter: check if value meets target
        if (logEntry && habit.metric) {
          if (habit.type === "limiter") {
            // Limiter: strike only if EXCEEDED the limit
            if (logEntry.value <= logEntry.target) continue;
          } else {
            // Metric: strike only if value didn't reach target
            if (logEntry.value >= logEntry.target) continue;
          }
        }
      }

      // Interval strike guard: one strike per due date per habit
      if (habit.period === "interval") {
        const key = `${habit.id}:${dateStr}`;
        if (intervalStrikeTracker.has(key)) continue;
        intervalStrikeTracker.add(key);
      }

      // ── MISSED / LIMITER EXCEEDED: add a strike ──
      result.missedCount++;
      try {
        // BUG 7: Pass "limiter_exceeded" reason for limiter habits so they can be undone
        const strikeReason = habit.type === "limiter" ? "limiter_exceeded" : "missed";
        await addStrike(habit.id, habit.title, strikeReason);
        result.strikesAdded++;
      } catch {
        // If strikes are already at max (locked out), addStrike is a no-op
      }
    }

    // Process todo deadlines chronologically for this day
    if (activeTodos.length > 0) {
      try {
        const { checkDeadlines } = await import("../../todos/services/deadlineChecker");
        const todoStrikes = await checkDeadlines(activeTodos, dailyResetTime, dateStr);
        result.strikesAdded += todoStrikes;
      } catch (err) {
        console.error(`Failed to process todo deadlines for ${dateStr} in gapProcessor:`, err);
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // 9. Update lastActiveDate
  await updateLastActiveDate(today);

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────

async function updateLastActiveDate(today: string): Promise<void> {
  const u = auth.currentUser;
  if (!u) return;
  await updateUserDoc(u.uid, { lastActiveDate: today } as any);
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}

function prevDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

function getWeekStart(dateStr: string, weekStartDay: number): string {
  const d = new Date(dateStr + "T12:00:00");
  while (d.getDay() !== weekStartDay) {
    d.setDate(d.getDate() - 1);
  }
  return formatDate(d);
}

function getMonthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}
