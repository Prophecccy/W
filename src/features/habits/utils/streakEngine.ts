import { Habit, HabitLog } from "../types";
import { formatDate } from "../../../shared/utils/dateUtils";
import { isHabitScheduledToday } from "./scheduleEngine";

/**
 * Parses a YYYY-MM-DD date string using the local timezone to avoid
 * UTC translation shifts that occur with standard new Date(dateStr) calls.
 */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ─── Per-habit streak ─────────────────────────────────────────────

/**
 * Calculates the current streak for a single habit based on its log history.
 * Handles daily, weekly, monthly, and interval period types.
 */
export function calculateStreak(habit: Habit, logs: HabitLog[]): number {
  if (habit.type === "limiter") {
    const today = formatDate(new Date());
    const startLimitDate = habit.startDate || formatDate(new Date(habit.createdAt));
    const sorted = [...logs].sort((a, b) => (a.date > b.date ? -1 : 1));
    let streak = 0;

    if (habit.period === "daily") {
      let expectedDate = today;
      while (expectedDate >= startLimitDate) {
        const log = sorted.find((l) => l.date === expectedDate);
        const entry = log?.habits?.[habit.id];
        if (entry && entry.value > entry.target) {
          break;
        }
        streak++;
        const d = parseLocalDate(expectedDate);
        d.setDate(d.getDate() - 1);
        expectedDate = formatDate(d);
      }
      return streak;
    }

    if (habit.period === "weekly") {
      const byWeek = groupLogsByISOWeek(sorted);
      const weeks = getRecentWeeks(today, byWeek.size + 2);
      const startWeek = getISOWeek(startLimitDate);
      for (const week of weeks) {
        if (week < startWeek) break;
        const weekLogs = byWeek.get(week) ?? [];
        const hasViolation = weekLogs.some((l) => {
          const entry = l.habits?.[habit.id];
          return entry && entry.value > entry.target;
        });
        if (hasViolation) break;
        streak++;
      }
      return streak;
    }

    if (habit.period === "monthly") {
      const byMonth = groupLogsByMonth(sorted);
      const months = getRecentMonths(today, byMonth.size + 2);
      const startMonth = startLimitDate.slice(0, 7);
      for (const month of months) {
        if (month < startMonth) break;
        const monthLogs = byMonth.get(month) ?? [];
        const hasViolation = monthLogs.some((l) => {
          const entry = l.habits?.[habit.id];
          return entry && entry.value > entry.target;
        });
        if (hasViolation) break;
        streak++;
      }
      return streak;
    }

    if (habit.period === "interval") {
      const dueDates = buildDueDates(habit, startLimitDate, today);
      for (const dueDate of dueDates) {
        const matchLog = sorted.find((l) => l.date === dueDate);
        const entry = matchLog?.habits?.[habit.id];
        if (entry && entry.value > entry.target) break;
        streak++;
      }
      return streak;
    }
  }

  if (logs.length === 0) return 0;

  // Sort logs newest-first
  const sorted = [...logs].sort((a, b) => (a.date > b.date ? -1 : 1));

  let streak = 0;
  const today = formatDate(new Date());

  switch (habit.period) {
    case "daily": {
      // Each calendar day must have a completion
      let expectedDate = today;
      let isFirst = true;
      for (const log of sorted) {
        if (log.date !== expectedDate) {
          if (isFirst && expectedDate === today) {
            // Move expectedDate to yesterday and check again
            const d = parseLocalDate(today);
            d.setDate(d.getDate() - 1);
            expectedDate = formatDate(d);
            isFirst = false;
            if (log.date !== expectedDate) break;
          } else {
            break;
          }
        }
        const entry = log.habits[habit.id];
        if (!entry?.completed) {
          if (isFirst && expectedDate === today) {
            const d = parseLocalDate(today);
            d.setDate(d.getDate() - 1);
            expectedDate = formatDate(d);
            isFirst = false;
            continue;
          }
          break;
        }
        streak++;
        isFirst = false;
        // Move to previous day
        const d = parseLocalDate(expectedDate);
        d.setDate(d.getDate() - 1);
        expectedDate = formatDate(d);
      }
      break;
    }

    case "weekly": {
      // Count consecutive ISO weeks where the habit was completed >= frequency times
      const byWeek = groupLogsByISOWeek(sorted);
      const weeks = getRecentWeeks(today, byWeek.size + 2);
      let isFirst = true;
      for (const week of weeks) {
        const weekLogs = byWeek.get(week) ?? [];
        const completions = weekLogs.filter(
          (l) => l.habits[habit.id]?.completed
        ).length;
        if (completions < habit.frequency) {
          if (isFirst) {
            isFirst = false;
            continue;
          }
          break;
        }
        streak++;
        isFirst = false;
      }
      break;
    }

    case "monthly": {
      // Count consecutive calendar months with ≥ frequency completions
      const byMonth = groupLogsByMonth(sorted);
      const months = getRecentMonths(today, byMonth.size + 2);
      let isFirst = true;
      for (const month of months) {
        const monthLogs = byMonth.get(month) ?? [];
        const completions = monthLogs.filter(
          (l) => l.habits[habit.id]?.completed
        ).length;
        if (completions < habit.frequency) {
          if (isFirst) {
            isFirst = false;
            continue;
          }
          break;
        }
        streak++;
        isFirst = false;
      }
      break;
    }

    case "interval": {
      // Count consecutive "due dates" that were completed
      if (!habit.lastCompletedDate) return 0;
      const dueDates = buildDueDates(habit, sorted[sorted.length - 1].date, today);
      let isFirst = true;
      for (const dueDate of dueDates) {
        const matchLog = sorted.find((l) => l.date === dueDate);
        if (!matchLog?.habits[habit.id]?.completed) {
          if (isFirst && dueDate === today) {
            isFirst = false;
            continue;
          }
          break;
        }
        streak++;
        isFirst = false;
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
  logs: HabitLog[],
  weeklyResetDay: number = 1
): number {
  if (habits.length === 0 || logs.length === 0) return 0;

  const today = formatDate(new Date());
  const sorted = [...logs].sort((a, b) => (a.date > b.date ? -1 : 1));

  let streak = 0;
  let expectedDate = today;
  let isFirst = true;

  for (const log of sorted) {
    if (log.date !== expectedDate) {
      if (isFirst && expectedDate === today) {
        const d = parseLocalDate(today);
        d.setDate(d.getDate() - 1);
        expectedDate = formatDate(d);
        isFirst = false;
        if (log.date !== expectedDate) break;
      } else {
        break;
      }
    }

    // Check all scheduled habits are completed for this day
    const scheduledHabits = habits.filter((h) =>
      isHabitScheduledToday(h, log.date, weeklyResetDay)
    );
    const allCompleted = scheduledHabits.every((h) => {
      if (h.type === "limiter") {
        const entry = log.habits[h.id];
        return !entry || entry.value <= entry.target;
      }
      return log.habits[h.id]?.completed;
    });

    if (!allCompleted) {
      if (isFirst && expectedDate === today) {
        const d = parseLocalDate(today);
        d.setDate(d.getDate() - 1);
        expectedDate = formatDate(d);
        isFirst = false;
        continue;
      }
      break;
    }

    streak++;
    isFirst = false;
    const d = parseLocalDate(expectedDate);
    d.setDate(d.getDate() - 1);
    expectedDate = formatDate(d);
  }

  return streak;
}

function getISOWeek(dateStr: string): string {
  const d = parseLocalDate(dateStr);
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
  const d = parseLocalDate(today);
  for (let i = 0; i < count; i++) {
    weeks.push(getISOWeek(formatDate(d)));
    d.setDate(d.getDate() - 7);
  }
  return weeks;
}

function getRecentMonths(today: string, count: number): string[] {
  const months: string[] = [];
  const d = parseLocalDate(today);
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
  const startStr = habit.startDate || formatDate(new Date(habit.createdAt));
  const d = parseLocalDate(startStr);
  const end = parseLocalDate(today);
  while (d <= end) {
    const s = formatDate(d);
    if (s >= earliestLog) due.unshift(s);
    d.setDate(d.getDate() + habit.intervalDays);
  }
  return due;
}
