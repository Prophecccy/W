import { Habit, HabitLog } from "../types";
import { formatDate } from "../../../shared/utils/dateUtils";

// ─── Per-habit streak ─────────────────────────────────────────────

/**
 * Calculates the current streak for a single habit based on its log history.
 * Handles daily, weekly, monthly, and interval period types.
 */
export function calculateStreak(habit: Habit, logs: HabitLog[]): number {
  if (logs.length === 0) return 0;

  // Sort logs newest-first
  const sorted = [...logs].sort((a, b) => (a.date > b.date ? -1 : 1));

  let streak = 0;
  const today = formatDate(new Date());

  switch (habit.period) {
    case "daily": {
      // Each calendar day must have a completion
      let expectedDate = today;
      for (const log of sorted) {
        if (log.date !== expectedDate) break;
        const entry = log.habits[habit.id];
        if (!entry?.completed) break;
        streak++;
        // Move to previous day
        const d = new Date(expectedDate);
        d.setDate(d.getDate() - 1);
        expectedDate = formatDate(d);
      }
      break;
    }

    case "weekly": {
      // Count consecutive ISO weeks where the habit was completed >= frequency times
      const byWeek = groupLogsByISOWeek(sorted);
      const weeks = getRecentWeeks(today, byWeek.size + 2);
      for (const week of weeks) {
        const weekLogs = byWeek.get(week) ?? [];
        const completions = weekLogs.filter(
          (l) => l.habits[habit.id]?.completed
        ).length;
        if (completions < habit.frequency) break;
        streak++;
      }
      break;
    }

    case "monthly": {
      // Count consecutive calendar months with ≥ frequency completions
      const byMonth = groupLogsByMonth(sorted);
      const months = getRecentMonths(today, byMonth.size + 2);
      for (const month of months) {
        const monthLogs = byMonth.get(month) ?? [];
        const completions = monthLogs.filter(
          (l) => l.habits[habit.id]?.completed
        ).length;
        if (completions < habit.frequency) break;
        streak++;
      }
      break;
    }

    case "interval": {
      // Count consecutive "due dates" that were completed
      if (!habit.lastCompletedDate) return 0;
      const dueDates = buildDueDates(habit, sorted[0].date, today);
      for (const dueDate of dueDates) {
        const matchLog = sorted.find((l) => l.date === dueDate);
        if (!matchLog?.habits[habit.id]?.completed) break;
        streak++;
      }
      break;
    }
  }

  return streak;
}

// ─── Global streak ────────────────────────────────────────────────

/**
 * Calculates the global streak: consecutive calendar days where ALL
 * scheduled habits were completed.
 */
export function calculateGlobalStreak(
  habits: Habit[],
  logs: HabitLog[]
): number {
  if (habits.length === 0 || logs.length === 0) return 0;

  const today = formatDate(new Date());
  const sorted = [...logs].sort((a, b) => (a.date > b.date ? -1 : 1));

  let streak = 0;
  let expectedDate = today;

  for (const log of sorted) {
    if (log.date !== expectedDate) break;

    // Check all scheduled habits are completed for this day
    const scheduledHabits = habits.filter((h) =>
      isScheduledOnDate(h, log.date)
    );
    const allCompleted = scheduledHabits.every(
      (h) => log.habits[h.id]?.completed
    );
    if (!allCompleted) break;

    streak++;
    const d = new Date(expectedDate);
    d.setDate(d.getDate() - 1);
    expectedDate = formatDate(d);
  }

  return streak;
}

// ─── Helpers ──────────────────────────────────────────────────────

function isScheduledOnDate(habit: Habit, date: string): boolean {
  if (!habit.isActive) return false;
  if (habit.period === "daily") return true;
  if (habit.period === "weekly") {
    const dayOfWeek = new Date(date).getDay();
    return habit.daysOfWeek.includes(dayOfWeek);
  }
  if (habit.period === "monthly") {
    // Simple: scheduled on the same day-of-month as creation
    const dayOfMonth = new Date(date).getDate();
    const creationDay = new Date(habit.createdAt).getDate();
    return dayOfMonth === creationDay;
  }
  if (habit.period === "interval") {
    const creation = new Date(habit.createdAt);
    const target = new Date(date);
    const diff = Math.floor(
      (target.getTime() - creation.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diff >= 0 && diff % habit.intervalDays === 0;
  }
  return false;
}

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const weekNum = Math.ceil(
    ((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7
  );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function groupLogsByISOWeek(logs: HabitLog[]): Map<string, HabitLog[]> {
  const map = new Map<string, HabitLog[]>();
  for (const log of logs) {
    const week = getISOWeek(log.date);
    if (!map.has(week)) map.set(week, []);
    map.get(week)!.push(log);
  }
  return map;
}

function groupLogsByMonth(logs: HabitLog[]): Map<string, HabitLog[]> {
  const map = new Map<string, HabitLog[]>();
  for (const log of logs) {
    const month = log.date.slice(0, 7); // "YYYY-MM"
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(log);
  }
  return map;
}

function getRecentWeeks(today: string, count: number): string[] {
  const weeks: string[] = [];
  const d = new Date(today);
  for (let i = 0; i < count; i++) {
    weeks.push(getISOWeek(formatDate(d)));
    d.setDate(d.getDate() - 7);
  }
  return weeks;
}

function getRecentMonths(today: string, count: number): string[] {
  const months: string[] = [];
  const d = new Date(today);
  for (let i = 0; i < count; i++) {
    months.push(formatDate(d).slice(0, 7));
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}

function buildDueDates(
  habit: Habit,
  earliestLog: string,
  today: string
): string[] {
  const due: string[] = [];
  const d = new Date(habit.createdAt);
  const end = new Date(today);
  while (d <= end) {
    const s = formatDate(d);
    if (s >= earliestLog) due.unshift(s);
    d.setDate(d.getDate() + habit.intervalDays);
  }
  return due;
}
