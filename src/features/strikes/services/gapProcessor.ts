import { HabitLog } from "../../habits/types";
import { isHabitScheduledToday } from "../../habits/utils/scheduleEngine";
import { addStrike } from "./strikeService";
import { getLogRange } from "../../habits/services/logService";
import { getHabits } from "../../habits/services/habitService";
import { getFreezeState, isDateInFreezeRange, checkAutoFreeze } from "../../freeze/services/freezeService";
import { updateUserDoc, getUserDoc } from "../../auth/services/userService";
import { db, auth, doc, updateDoc } from "../../../shared/config/firebase";
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

let logQueue: string[] = [];
let isFlushing = false;

async function flushLogQueue() {
  if (isFlushing || logQueue.length === 0) return;
  if (typeof window === "undefined" || !(window as any).__TAURI_INTERNALS__) {
    // Browser mode: clear queue and print to console
    logQueue = [];
    return;
  }
  isFlushing = true;
  try {
    const { writeTextFile, readTextFile, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    let windowLabel = "unknown";
    try {
      windowLabel = (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label || "unknown";
    } catch {}
    const logFile = `w_gap_${windowLabel}_debug.log`;
    const toWrite = logQueue.join("\n");
    logQueue = [];
    
    let currentLogs = "";
    try {
      if (await exists(logFile, { baseDir: BaseDirectory.AppData })) {
        currentLogs = await readTextFile(logFile, { baseDir: BaseDirectory.AppData });
      }
    } catch (e) {}
    
    const newLogs = currentLogs + "\n" + toWrite;
    await writeTextFile(logFile, newLogs, { baseDir: BaseDirectory.AppData });
  } catch (e) {
    console.error("Failed to flush log queue:", e);
  } finally {
    isFlushing = false;
    if (logQueue.length > 0) {
      flushLogQueue().catch(() => {});
    }
  }
}

function logDebug(message: string) {
  console.log(message);
  const logLine = new Date().toISOString() + " [GAP_PROC]: " + message;
  logQueue.push(logLine);
  flushLogQueue().catch(() => {});
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
  try {
    const { writeTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    let windowLabel = "unknown";
    try {
      windowLabel = (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label || "unknown";
    } catch {}
    await writeTextFile(`w_gap_${windowLabel}_debug.log`, `--- NEW RUN: ${new Date().toISOString()} ---\n`, { baseDir: BaseDirectory.AppData });
  } catch (e) {}

  logDebug(`processGap entry. lastActiveDate: ${lastActiveDate}, today: ${today}`);
  const result: GapProcessorResult = {
    daysProcessed: 0,
    missedCount: 0,
    strikesAdded: 0,
    frozenDaysSkipped: 0,
    autoFreezeTriggered: false,
    frozenSince: null,
  };

  // Guard: if lastActiveDate is falsy, undefined, or invalid — skip processing and set it to today
  if (!lastActiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastActiveDate) || isNaN(new Date(lastActiveDate + "T12:00:00").getTime())) {
    logDebug(`Invalid or missing lastActiveDate: ${lastActiveDate} — setting to today and skipping.`);
    await updateLastActiveDate(today);
    return result;
  }

  // If same day or future — nothing to process
  if (lastActiveDate >= today) {
    logDebug("lastActiveDate is today or future, returning early.");
    return result;
  }

  // 1. Check for auto-freeze (≥ 3 day absence)
  logDebug("Checking auto-freeze...");
  const autoFreezeResult = await checkAutoFreeze(lastActiveDate, today);
  logDebug(`Auto-freeze check done: ${JSON.stringify(autoFreezeResult)}`);
  if (autoFreezeResult.triggered) {
    result.autoFreezeTriggered = true;
    result.frozenSince = autoFreezeResult.frozenSince;
    logDebug("Auto-freeze triggered! Updating lastActiveDate to today and returning.");
    await updateLastActiveDate(today);
    return result;
  }

  // 2. Fetch freeze state (for manual freezes or historical freeze ranges)
  logDebug("Fetching freeze state...");
  const freezeState = await getFreezeState();
  logDebug(`Freeze state fetched: ${JSON.stringify(freezeState)}`);

  // 3. Fetch all active habits
  logDebug("Fetching active habits...");
  const habits = await getHabits();
  logDebug(`Habits fetched. Count: ${habits.length}`);
  if (habits.length === 0) {
    logDebug("No habits found, updating lastActiveDate and returning.");
    await updateLastActiveDate(today);
    return result;
  }

  // Fetch user settings to respect custom weeklyResetDay, dailyResetTime, and strikeSystemEnabled
  let weeklyResetDay = 1;
  let dailyResetTime: string | undefined;
  let strikeSystemEnabled = true;
  const u = auth.currentUser;
  if (u) {
    try {
      logDebug(`Fetching user doc settings for uid: ${u.uid}...`);
      const userD = await getUserDoc(u.uid);
      logDebug("User doc settings fetched successfully.");
      if (userD?.settings?.weeklyResetDay !== undefined) {
        weeklyResetDay = userD.settings.weeklyResetDay;
      }
      if (userD?.settings?.dailyResetTime !== undefined) {
        dailyResetTime = userD.settings.dailyResetTime;
      }
      if (userD?.settings?.strikeSystemEnabled !== undefined) {
        strikeSystemEnabled = userD.settings.strikeSystemEnabled;
      }
    } catch (e: any) {
      logDebug(`Failed to fetch user doc for settings: ${e?.message || e}`);
    }
  } else {
    logDebug("No auth.currentUser found when checking settings.");
  }

  // 4. Calculate the date range to process: (lastActiveDate + 1) … yesterday
  const startDate = nextDay(lastActiveDate);
  const yesterday = prevDay(today);
  logDebug(`Processing range: ${startDate} to ${yesterday}`);

  if (startDate > yesterday) {
    logDebug("startDate > yesterday, updating lastActiveDate to yesterday.");
    await updateLastActiveDate(yesterday);
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
  logDebug(`Fetching logs in range: ${logFetchStartDate} to ${yesterday}`);
  const logs = await getLogRange(logFetchStartDate, yesterday);
  logDebug(`Logs fetched. Count: ${logs.length}`);
  const logMap = new Map<string, HabitLog>();
  for (const log of logs) {
    logMap.set(log.date, log);
  }

  // 6. Track interval habit strike dates to enforce single-strike-per-due-date
  const intervalStrikeTracker = new Set<string>(); // "habitId:date"

  // 6.5 Fetch active and recently completed todos once before the day-by-day loop
  logDebug("Fetching active/completed todos...");
  let activeTodos: any[] = [];
  try {
    const { getTodos, getCompletedTodos } = await import("../../todos/services/todoService");
    logDebug("Imported todoService. Calling getTodos and getCompletedTodos...");
    const [activeList, completedList] = await Promise.all([
      getTodos(),
      getCompletedTodos()
    ]);
    activeTodos = [...activeList, ...completedList];
    logDebug(`Todos fetched. Count: ${activeTodos.length}`);
  } catch (err: any) {
    logDebug(`Failed to fetch todos for gap processor: ${err?.message || err}`);
  }

  // 7. Day-by-day loop
  let currentDate = new Date(startDate + "T12:00:00");
  const endDate = new Date(yesterday + "T12:00:00");
  logDebug(`Starting day-by-day loop from: ${formatDate(currentDate)} to: ${formatDate(endDate)}`);

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

      // Period end streak updates for weekly and monthly habits
      const isPeriodEndWeekly = habit.period === "weekly" && currentDate.getDay() === (weeklyResetDay === 0 ? 6 : weeklyResetDay - 1);
      
      const nextDayD = new Date(currentDate);
      nextDayD.setDate(nextDayD.getDate() + 1);
      const isPeriodEndMonthly = habit.period === "monthly" && nextDayD.getMonth() !== currentDate.getMonth();

      const isPeriodEnd = isPeriodEndWeekly || isPeriodEndMonthly;

      if (isPeriodEnd) {
        const periodStart = habit.period === "weekly"
          ? getWeekStart(dateStr, weeklyResetDay)
          : getMonthStart(dateStr);

        const habitStartStr = habit.startDate || formatDate(new Date(habit.createdAt));
        
        if (habitStartStr <= dateStr) {
          // Calculate cumulative progress over the period
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

          const targetValue = habit.type === "standard" ? (habit.frequency || 1) : (habit.metric?.targetValue ?? 1);
          const u = auth.currentUser;
          if (u) {
            const habitRef = doc(db, "users", u.uid, "habits", habit.id);

            if (habit.type === "limiter") {
              if (cumulativeValue <= targetValue) {
                // Limiter Success: increment streak
                const currentStreak = (habit.currentStreak || 0) + 1;
                const longestStreak = Math.max(habit.longestStreak || 0, currentStreak);
                await updateDoc(habitRef, {
                  currentStreak,
                  longestStreak,
                  lastCompletedDate: dateStr,
                });
                habit.currentStreak = currentStreak;
                habit.longestStreak = longestStreak;
                habit.lastCompletedDate = dateStr;
              } else {
                // Limiter Exceeded: reset streak
                await updateDoc(habitRef, { currentStreak: 0 });
                habit.currentStreak = 0;
              }
            } else {
              // Standard or Metric
              if (cumulativeValue < targetValue) {
                // Missed: reset streak
                await updateDoc(habitRef, { currentStreak: 0 });
                habit.currentStreak = 0;
              }
            }
          }
        }
      }

      // Special evaluation for multi-day metric/limiter and standard anyday habits
      const isMultiDayPeriodEvaluation =
        (habit.period === "weekly" || habit.period === "monthly") &&
        (habit.type === "metric" || habit.type === "limiter" || habit.type === "standard");

      if (isMultiDayPeriodEvaluation) {
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

        const targetValue = habit.type === "standard" ? (habit.frequency || 1) : (habit.metric?.targetValue ?? 0);
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

        // Was this habit scheduled on this day?
        if (!isHabitScheduledToday(habit, dateStr, weeklyResetDay)) {
          continue;
        }

        // For daily/interval limiters: update streak based on success/failure
        if (habit.type === "limiter" && (habit.period === "daily" || habit.period === "interval")) {
          const logEntry = dayLog?.habits?.[habit.id];
          const hasExceeded = logEntry ? logEntry.value > logEntry.target : false;
          const u = auth.currentUser;
          if (u) {
            const habitRef = doc(db, "users", u.uid, "habits", habit.id);
            if (!hasExceeded) {
              const currentStreak = (habit.currentStreak || 0) + 1;
              const longestStreak = Math.max(habit.longestStreak || 0, currentStreak);
              await updateDoc(habitRef, {
                currentStreak,
                longestStreak,
                lastCompletedDate: dateStr,
              });
              habit.currentStreak = currentStreak;
              habit.longestStreak = longestStreak;
              habit.lastCompletedDate = dateStr;
            } else {
              const updates: Record<string, any> = { currentStreak: 0 };
              if (habit.period === "interval") {
                updates.lastCompletedDate = dateStr;
                habit.lastCompletedDate = dateStr;
              }
              await updateDoc(habitRef, updates);
              habit.currentStreak = 0;
            }
          }
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
      if (strikeSystemEnabled) {
        try {
          // BUG 7: Pass "limiter_exceeded" reason for limiter habits so they can be undone
          const strikeReason = habit.type === "limiter" ? "limiter_exceeded" : "missed";
          await addStrike(habit.id, habit.title, strikeReason);
          result.strikesAdded++;
        } catch {
          // If strikes are already at max (locked out), addStrike is a no-op
        }
      }

      // Reset streak for missed standard/metric habits (daily, weekly, monthly, interval)
      if (habit.type !== "limiter") {
        const u = auth.currentUser;
        if (u) {
          const habitRef = doc(db, "users", u.uid, "habits", habit.id);
          const updates: Record<string, any> = { currentStreak: 0 };
          if (habit.period === "interval") {
            updates.lastCompletedDate = dateStr;
            habit.lastCompletedDate = dateStr;
          }
          await updateDoc(habitRef, updates);
          habit.currentStreak = 0;
        }
      }
    }

    // Process todo deadlines chronologically for this day (skip if this specific day is frozen)
    if (!isFrozen && activeTodos.length > 0) {
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
  await updateLastActiveDate(yesterday);

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────

async function updateLastActiveDate(today: string): Promise<void> {
  logDebug(`updateLastActiveDate: entry. today: ${today}`);
  const u = auth.currentUser;
  if (!u) {
    logDebug("updateLastActiveDate: no currentUser, returning.");
    return;
  }
  logDebug(`updateLastActiveDate: calling updateUserDoc for ${u.uid}...`);
  try {
    await updateUserDoc(u.uid, { lastActiveDate: today } as any);
    logDebug("updateLastActiveDate: updateUserDoc resolved successfully.");
  } catch (err: any) {
    logDebug(`updateLastActiveDate: updateUserDoc threw: ${err?.message || err}`);
    throw err;
  }
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
  if (isNaN(d.getTime())) {
    console.warn("[getWeekStart] Invalid dateStr:", dateStr, "— returning dateStr as-is.");
    return dateStr;
  }
  let safety = 0;
  while (d.getDay() !== weekStartDay && safety < 10) {
    d.setDate(d.getDate() - 1);
    safety++;
  }
  return formatDate(d);
}

function getMonthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}
