import { HabitLog } from "../../habits/types";
import { isHabitScheduledToday } from "../../habits/utils/scheduleEngine";
import { addStrike } from "./strikeService";
import { getLogRange } from "../../habits/services/logService";
import { getHabits } from "../../habits/services/habitService";
import { getFreezeState, isDateInFreezeRange, checkAutoFreeze } from "../../freeze/services/freezeService";
import { updateUserDoc } from "../../auth/services/userService";
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

  // 4. Calculate the date range to process: (lastActiveDate + 1) … yesterday
  const startDate = nextDay(lastActiveDate);
  const yesterday = prevDay(today);

  if (startDate > yesterday) {
    await updateLastActiveDate(today);
    return result;
  }

  // 5. Fetch all logs in the gap range (batch read — efficient)
  const logs = await getLogRange(startDate, yesterday);
  const logMap = new Map<string, HabitLog>();
  for (const log of logs) {
    logMap.set(log.date, log);
  }

  // 6. Track interval habit strike dates to enforce single-strike-per-due-date
  const intervalStrikeTracker = new Set<string>(); // "habitId:date"

  // 7. Day-by-day loop
  let currentDate = new Date(startDate + "T12:00:00");
  const endDate = new Date(yesterday + "T12:00:00");

  while (currentDate <= endDate) {
    const dateStr = formatDate(currentDate);
    result.daysProcessed++;

    // Skip frozen days
    if (isDateInFreezeRange(freezeState, dateStr)) {
      result.frozenDaysSkipped++;
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    // Check each habit
    const dayLog = logMap.get(dateStr);

    for (const habit of habits) {
      // Only process habits that existed before this date
      if (habit.createdAt > new Date(dateStr + "T23:59:59").getTime()) {
        continue;
      }

      // Was this habit scheduled on this day?
      if (!isHabitScheduledToday(habit, dateStr)) {
        continue;
      }

      // Was it completed in the log?
      const logEntry = dayLog?.habits?.[habit.id];
      if (logEntry && logEntry.completed) {
        continue;
      }

      // For metric/limiter: check if value meets target
      if (logEntry && habit.metric) {
        if (habit.type === "limiter") {
          // Limiter: strike only if EXCEEDED the limit
          if (logEntry.value <= logEntry.target) continue;
        } else {
          // Metric: strike only if value didn't reach target
          if (logEntry.value >= logEntry.target) continue;
        }
      }

      // Interval strike guard: one strike per due date per habit
      if (habit.period === "interval") {
        const key = `${habit.id}:${dateStr}`;
        if (intervalStrikeTracker.has(key)) continue;
        intervalStrikeTracker.add(key);
      }

      // ── MISSED: add a strike ──
      result.missedCount++;
      try {
        await addStrike(habit.id, habit.title, "missed");
        result.strikesAdded++;
      } catch {
        // If strikes are already at max (locked out), addStrike is a no-op
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // 8. Todo Deadlines Checker
  try {
    const { getTodos } = await import("../../todos/services/todoService");
    const { checkDeadlines } = await import("../../todos/services/deadlineChecker");
    
    // We only process deadlines if auto-freeze wasn't triggered and we aren't completely frozen now
    // Actually, checkDeadlines doesn't explicitly skip frozen days currently, but we can run it.
    const activeTodos = await getTodos();
    const todoStrikes = await checkDeadlines(activeTodos, today);
    result.strikesAdded += todoStrikes;
  } catch (err) {
    console.error("Failed to process todo deadlines in gapProcessor:", err);
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
