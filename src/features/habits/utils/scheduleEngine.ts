import { Habit } from "../types";
import { getToday, formatDate } from "../../../shared/utils/dateUtils";

// ─── isHabitScheduledToday ────────────────────────────────────────

/**
 * Determines if a habit is due on the given date (defaults to today).
 * Handles daily, weekly (daysOfWeek), monthly (same day-of-month), and interval.
 */
export function isHabitScheduledToday(
  habit: Habit,
  today: string = getToday()
): boolean {
  if (!habit.isActive) return false;

  // Check endpoint duration
  if (habit.duration.type === "endpoint" && habit.duration.endDate) {
    if (today > habit.duration.endDate) return false;
  }

  switch (habit.period) {
    case "daily":
      return true;

    case "weekly": {
      // daysOfWeek: 0=Sunday … 6=Saturday, matching JS getDay()
      // Note: new Date("YYYY-MM-DD") parses as UTC — adjust for local
      const d = new Date(today + "T12:00:00");
      return habit.daysOfWeek.includes(d.getDay());
    }

    case "monthly": {
      // Scheduled on the same day-of-month as creation
      const d = new Date(today + "T12:00:00");
      const creationDay = new Date(habit.createdAt).getDate();
      return d.getDate() === creationDay;
    }

    case "interval": {
      if (habit.intervalDays <= 0) return false;
      const creationDate = new Date(habit.createdAt);
      const targetDate = new Date(today + "T12:00:00");
      const diffMs = targetDate.getTime() - creationDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays % habit.intervalDays === 0;
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
  const creationDate = new Date(habit.createdAt);
  const todayDate = new Date(today + "T12:00:00");

  const diffDays = Math.floor(
    (todayDate.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // How many full intervals have elapsed?
  const completedIntervals = Math.floor(diffDays / habit.intervalDays);
  // Next due interval
  const nextIntervalDays = (completedIntervals + 1) * habit.intervalDays;
  const nextDate = new Date(creationDate);
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
