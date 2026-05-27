import { Habit } from "../types";
import { getToday, formatDate, addDays } from "../../../shared/utils/dateUtils";

// ─── isHabitResting ───────────────────────────────────────────────

/**
 * Checks if an interval habit is currently in a resting state (fully completed for
 * the current cycle and in its cooldown/recovery period).
 */
export function isHabitResting(
  habit: Habit,
  userResetTime?: string
): boolean {
  if (habit.period !== "interval" || !habit.lastCompletedDate) return false;
  if (habit.intervalDays <= 0) return false;

  const nextActiveDate = addDays(habit.lastCompletedDate, habit.intervalDays);
  const today = getToday(undefined, userResetTime);
  return today < nextActiveDate;
}

// Helper functions for period calculations
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

// ─── isHabitScheduledToday ────────────────────────────────────────

/**
 * Determines if a habit is due on the given date (defaults to today).
 * Handles daily, weekly (daysOfWeek), monthly (same day-of-month), and interval.
 */
export function isHabitScheduledToday(
  habit: Habit,
  today: string = getToday(),
  weeklyResetDay: number = 1
): boolean {
  if (!habit.isActive) return false;

  // Use startDate (user-facing activation date) if available, else fall back to createdAt
  const activationDate = habit.startDate
    ? habit.startDate
    : formatDate(new Date(habit.createdAt));
  if (today < activationDate) return false;

  // Check endpoint duration
  if (habit.duration.type === "endpoint" && habit.duration.endDate) {
    if (today > habit.duration.endDate) return false;
  }

  switch (habit.period) {
    case "daily":
      return true;

    case "weekly": {
      if (habit.type === "standard" && habit.lastCompletedDate) {
        const currentWeekStart = getWeekStart(today, weeklyResetDay);
        if (habit.lastCompletedDate >= currentWeekStart) {
          return false; // Already completed standard weekly habit this week
        }
      }
      // If daysOfWeek is provided, check if it includes today
      if (habit.daysOfWeek && habit.daysOfWeek.length > 0) {
        const d = new Date(today + "T12:00:00");
        return habit.daysOfWeek.includes(d.getDay());
      }
      return true;
    }

    case "monthly": {
      if (habit.type === "standard" && habit.lastCompletedDate) {
        const currentMonthStart = getMonthStart(today);
        if (habit.lastCompletedDate >= currentMonthStart) {
          return false; // Already completed standard monthly habit this month
        }
      }
      const dayOfMonth = new Date(today + "T12:00:00").getDate();
      const creationDay = new Date(habit.createdAt).getDate();
      return dayOfMonth === creationDay;
    }

    case "interval": {
      if (habit.intervalDays <= 0) return false;
      if (habit.lastCompletedDate) {
        const nextActiveDate = addDays(habit.lastCompletedDate, habit.intervalDays);
        if (today < nextActiveDate) {
          return false; // resting cooldown
        }
      }
      return true;
    }

    default:
      return false;
  }
}

// ─── getNextDueDate ───────────────────────────────────────────────

/**
 * For interval habits: returns the next date (YYYY-MM-DD) on which the
 * habit is due, starting from today (exclusive).
 */
export function getNextDueDate(habit: Habit): string | null {
  if (habit.period !== "interval" || habit.intervalDays <= 0) return null;

  const today = getToday();
  const activationDate = habit.startDate
    ? habit.startDate
    : formatDate(new Date(habit.createdAt));

  const startD = new Date(activationDate + "T12:00:00");
  const todayD = new Date(today + "T12:00:00");

  const diffMs = todayD.getTime() - startD.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  // If today is before activationDate, the next due date is the activationDate itself!
  if (diffDays < 0) {
    return activationDate;
  }

  // How many full intervals have elapsed?
  const completedIntervals = Math.floor(diffDays / habit.intervalDays);
  // Next due interval
  const nextIntervalDays = (completedIntervals + 1) * habit.intervalDays;
  const nextDate = new Date(startD);
  nextDate.setDate(nextDate.getDate() + nextIntervalDays);

  return formatDate(nextDate);
}

// ─── getScheduledDaysInRange ──────────────────────────────────────

/**
 * Returns an array of "YYYY-MM-DD" strings within [startDate, endDate]
 * on which the habit is due. Used by analytics and gap processor.
 */
export function getScheduledDaysInRange(
  habit: Habit,
  startDate: string,
  endDate: string
): string[] {
  const result: string[] = [];
  const current = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");

  while (current <= end) {
    const dateStr = formatDate(current);
    if (isHabitScheduledToday(habit, dateStr)) {
      result.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }

  return result;
}
