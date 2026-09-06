import { getLogRange } from "../../habits/services/logService";
import { Habit, HabitLog } from "../../habits/types";
import {
  DayActivity,
  HabitAnalytics,
  MonthlySummary,
  WeeklySummary,
} from "../types";
import { isHabitScheduledToday } from "../../habits/utils/scheduleEngine";

import { getToday, formatDate, addDays } from "../../../shared/utils/dateUtils";

function getWeekStartLocal(dateStr: string, weekStartDay: number = 1): string {
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr;
  let safety = 0;
  while (d.getDay() !== weekStartDay && safety < 10) {
    d.setDate(d.getDate() - 1);
    safety++;
  }
  return formatDate(d);
}

function getWeeklyHabitCompletionRate(
  logs: HabitLog[],
  habit: Habit,
  startDateStr: string,
  endDateStr: string,
  weeklyResetDay: number = 1,
): number {
  const logMap: Record<string, HabitLog> = {};
  for (const log of logs) logMap[log.date] = log;

  const target = habit.type === "standard" ? (habit.frequency || 1) : (habit.metric?.targetValue ?? 1);
  const todayStr = getToday();

  // Group active days by week key
  const weekMap: Record<string, { completions: number; daysCount: number }> = {};

  let current = new Date(startDateStr + "T00:00:00");
  const end = new Date(endDateStr + "T00:00:00");

  while (current <= end) {
    const dStr = formatDate(current);
    if (dStr > todayStr) break;

    const weekAnchor = getWeekStartLocal(dStr, weeklyResetDay);
    if (!weekMap[weekAnchor]) {
      weekMap[weekAnchor] = { completions: 0, daysCount: 0 };
    }
    weekMap[weekAnchor].daysCount += 1;

    const log = logMap[dStr];
    const entry = log?.habits?.[habit.id];
    if (entry && (entry.completed || (entry.completions?.length ?? 0) > 0 || (entry.value ?? 0) > 0)) {
      weekMap[weekAnchor].completions += 1;
    }

    current.setDate(current.getDate() + 1);
  }

  let totalScheduledUnits = 0;
  let totalCompletedUnits = 0;

  for (const week of Object.values(weekMap)) {
    const expected = week.daysCount >= 7 ? target : Math.max(1, Math.round((target * week.daysCount) / 7));
    totalScheduledUnits += expected;
    totalCompletedUnits += Math.min(week.completions, expected);
  }

  return totalScheduledUnits === 0 ? 0 : Math.round((totalCompletedUnits / totalScheduledUnits) * 100);
}

export function getCompletionRate(
  logs: HabitLog[],
  habits: Habit[],
  startDateStr: string,
  endDateStr: string,
  habitId?: string,
  weeklyResetDay?: number,
): number {
  if (habitId) {
    const targetHabit = habits.find((h) => h.id === habitId);
    if (targetHabit?.period === "weekly") {
      return getWeeklyHabitCompletionRate(logs, targetHabit, startDateStr, endDateStr, weeklyResetDay);
    }
  }

  const logMap: Record<string, HabitLog> = {};
  for (const log of logs) logMap[log.date] = log;

  let scheduled = 0;
  let completed = 0;

  const start = new Date(startDateStr + "T00:00:00");
  const end = new Date(endDateStr + "T00:00:00");
  const todayStr = getToday();

  let current = new Date(start);
  while (current <= end) {
    const dStr = formatDate(current);

    // Stop counting if we pass today
    if (dStr > todayStr) break;

    const scheduledHabits = habitId
      ? habits.filter((h) => h.id === habitId && isHabitScheduledToday(h, dStr, weeklyResetDay))
      : habits.filter((h) => isHabitScheduledToday(h, dStr, weeklyResetDay));

    let dayScheduled = scheduledHabits.length;
    let dayCompleted = 0;

    const log = logMap[dStr];
    if (log) {
      if (habitId) {
        const entry = log.habits?.[habitId];
        const hasActivity = Boolean(
          entry && (entry.completed || (entry.completions?.length ?? 0) > 0 || (entry.value ?? 0) > 0)
        );
        if (hasActivity) {
          dayCompleted = 1;
        }
      } else {
        dayCompleted = scheduledHabits.filter((h) => {
          const entry = log.habits?.[h.id];
          if (!entry) return false;
          if (entry.completed) return true;
          return (entry.value ?? 0) > 0 || ((entry.completions?.length ?? 0) > 0);
        }).length;
      }
    }

    if (dayCompleted > dayScheduled) {
      dayScheduled = dayCompleted;
    }

    scheduled += dayScheduled;
    completed += dayCompleted;

    current.setDate(current.getDate() + 1);
  }

  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}

// Helpers
const getDayOfWeek = (dateString: string) => {
  // Use T12:00:00 to avoid timezone shifting the day of week.
  return new Date(dateString + "T12:00:00").getDay();
};

export function getBestWorstDays(
  logs: HabitLog[],
  habits: Habit[],
  weeklyResetDay?: number,
): {
  best: number | null;
  worst: number | null;
  averages: Record<number, number>;
} {
  const dayStats: Record<number, { scheduled: number; completed: number }> = {};
  for (let i = 0; i < 7; i++) dayStats[i] = { scheduled: 0, completed: 0 };

  for (const log of logs) {
    const day = getDayOfWeek(log.date);
    const scheduledHabits = habits.filter((h) =>
      isHabitScheduledToday(h, log.date, weeklyResetDay),
    );
    dayStats[day].scheduled += scheduledHabits.length;

    for (const h of scheduledHabits) {
      const entry = log.habits[h.id];
      const isMulti = h.period === "weekly" || h.period === "monthly";
      const hasActivity = Boolean(
        entry && ((entry.completions?.length ?? 0) > 0 || (entry.value ?? 0) > 0)
      );
      if (entry && (entry.completed || (isMulti && hasActivity))) {
        dayStats[day].completed += 1;
      }
    }
  }

  const averages: Record<number, number> = {};
  let best = -1;
  let worst = -1;
  let highest = -1;
  let lowest = 101;

  for (let i = 0; i < 7; i++) {
    const stats = dayStats[i];
    const rate =
      stats.scheduled === 0 ? 0 : (stats.completed / stats.scheduled) * 100;
    averages[i] = Math.round(rate);

    if (stats.scheduled > 0) {
      if (rate > highest) {
        highest = rate;
        best = i;
      }
      if (rate < lowest) {
        lowest = rate;
        worst = i;
      }
    }
  }

  return {
    best: best !== -1 ? best : null,
    worst: worst !== -1 ? worst : null,
    averages,
  };
}

export function getStreakProximity(habit: Habit): number {
  return Math.max(0, habit.longestStreak - habit.currentStreak);
}

export function getMostConsistent(
  habits: Habit[],
  logs: HabitLog[],
  startDateStr: string,
  endDateStr: string,
  weeklyResetDay?: number,
): Habit | null {
  let highestRate = -1;
  let mostConsistent: Habit | null = null;

  for (const habit of habits) {
    const rate = getCompletionRate(
      logs,
      habits,
      startDateStr,
      endDateStr,
      habit.id,
      weeklyResetDay,
    );
    if (rate > highestRate && rate > 0) {
      highestRate = rate;
      mostConsistent = habit;
    }
  }

  return mostConsistent;
}

export function getMostImproved(
  habits: Habit[],
  logs: HabitLog[],
  startDateStr: string,
  endDateStr: string,
  weeklyResetDay?: number,
): Habit | null {
  const start = new Date(startDateStr + "T12:00:00");
  const end = new Date(endDateStr + "T12:00:00");
  const midMs = start.getTime() + (end.getTime() - start.getTime()) / 2;
  const midDateStr = formatDate(new Date(midMs));

  let highestImprovement = 0;
  let mostImproved: Habit | null = null;

  for (const habit of habits) {
    const rate1 = getCompletionRate(
      logs,
      habits,
      startDateStr,
      midDateStr,
      habit.id,
      weeklyResetDay,
    );
    const nextOfMidDateStr = addDays(midDateStr, 1);
    const rate2 = getCompletionRate(
      logs,
      habits,
      nextOfMidDateStr,
      endDateStr,
      habit.id,
      weeklyResetDay,
    );
    const improvement = rate2 - rate1;

    if (improvement > highestImprovement && rate2 > 0) {
      highestImprovement = improvement;
      mostImproved = habit;
    }
  }

  return mostImproved;
}

function processDayActivities(
  logs: HabitLog[],
  habits: Habit[],
  startDate: string,
  endDate: string,
  weeklyResetDay?: number,
): DayActivity[] {
  const logMap: Record<string, HabitLog> = {};
  for (const log of logs) logMap[log.date] = log;

  const result: DayActivity[] = [];
  const endD = new Date(endDate + "T12:00:00");
  const startD = new Date(startDate + "T12:00:00");
  const todayStr = getToday();

  let maxIterations = 365;

  while (startD <= endD && maxIterations > 0) {
    const dStr = formatDate(startD);

    if (dStr > todayStr) {
      result.push({
        date: dStr,
        totalScheduled: 0,
        totalCompleted: 0,
        completionRate: 0,
      });
      startD.setDate(startD.getDate() + 1);
      maxIterations--;
      continue;
    }

    const scheduledHabits = habits.filter((h) =>
      isHabitScheduledToday(h, dStr, weeklyResetDay),
    );
    let scheduled = scheduledHabits.length;
    let completed = 0;

    const log = logMap[dStr];
    if (log) {
      completed = scheduledHabits.filter((h) => {
        const entry = log.habits[h.id];
        if (!entry) return false;
        if (entry.completed) return true;
        if (h.period === "weekly" || h.period === "monthly") {
          return (entry.value ?? 0) > 0 || ((entry.completions?.length ?? 0) > 0);
        }
        return false;
      }).length;
    }

    if (completed > scheduled) {
      scheduled = completed;
    }

    result.push({
      date: dStr,
      totalScheduled: scheduled,
      totalCompleted: completed,
      completionRate:
        scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100),
    });

    startD.setDate(startD.getDate() + 1);
    maxIterations--;
  }

  return result;
}

export async function generateWeeklySummary(
  startDate: string,
  endDate: string,
  previousStartDate: string,
  previousEndDate: string,
  habits: Habit[],
  weeklyResetDay?: number,
): Promise<WeeklySummary> {
  const currentLogs = await getLogRange(startDate, endDate);
  const prevLogs = await getLogRange(previousStartDate, previousEndDate);

  const days = processDayActivities(currentLogs, habits, startDate, endDate, weeklyResetDay);
  let bestDay: DayActivity | null = null;
  let worstDay: DayActivity | null = null;

  if (days.length > 0) {
    let max = -1;
    let min = 101;
    for (const day of days) {
      if (day.totalScheduled > 0) {
        if (day.completionRate > max) {
          max = day.completionRate;
          bestDay = day;
        }
        if (day.completionRate < min) {
          min = day.completionRate;
          worstDay = day;
        }
      }
    }
  }

  return {
    startDate,
    endDate,
    completionRate: getCompletionRate(currentLogs, habits, startDate, endDate, undefined, weeklyResetDay),
    previousWeekCompletionRate: getCompletionRate(
      prevLogs,
      habits,
      previousStartDate,
      previousEndDate,
      undefined,
      weeklyResetDay,
    ),
    days,
    bestDay,
    worstDay,
  };
}

export async function generateMonthlySummary(
  startDate: string,
  endDate: string,
  previousStartDate: string,
  previousEndDate: string,
  habits: Habit[],
  weeklyResetDay?: number,
): Promise<MonthlySummary> {
  const currentLogs = await getLogRange(startDate, endDate);
  const prevLogs = await getLogRange(previousStartDate, previousEndDate);

  return {
    month: startDate.substring(0, 7), // YYYY-MM
    completionRate: getCompletionRate(currentLogs, habits, startDate, endDate, undefined, weeklyResetDay),
    previousMonthCompletionRate: getCompletionRate(
      prevLogs,
      habits,
      previousStartDate,
      previousEndDate,
      undefined,
      weeklyResetDay,
    ),
    days: processDayActivities(currentLogs, habits, startDate, endDate, weeklyResetDay),
    mostConsistent: getMostConsistent(habits, currentLogs, startDate, endDate, weeklyResetDay),
    mostImproved: getMostImproved(habits, currentLogs, startDate, endDate, weeklyResetDay),
  };
}

export function generateHabitAnalytics(
  habit: Habit,
  logs: HabitLog[],
  weeklyResetDay?: number,
): HabitAnalytics {
  const timeOfDayDistribution = new Array(24).fill(0);

  for (const log of logs) {
    const entry = log.habits?.[habit.id];
    const hasActivity = Boolean(
      entry && (entry.completed || (entry.value ?? 0) > 0 || (entry.completions?.length ?? 0) > 0)
    );
    if (hasActivity) {
      for (const comp of (entry?.completions ?? [])) {
        const d = new Date(comp.timestamp);
        const hour = d.getHours();
        timeOfDayDistribution[hour] += 1;
      }
    }
  }

  // Define date ranges for All Time, Current Month, Prev Month
  const creationDateStr = formatDate(new Date(habit.createdAt));
  const todayStr = getToday();

  const todayDate = new Date(todayStr + "T12:00:00");

  const monthStart = new Date(todayDate);
  monthStart.setDate(monthStart.getDate() - 29);
  const monthStartStr = formatDate(monthStart);

  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setDate(prevMonthStart.getDate() - 29);
  const prevMonthStartStr = formatDate(prevMonthStart);

  const prevMonthEnd = new Date(monthStart);
  prevMonthEnd.setDate(prevMonthEnd.getDate() - 1);
  const prevMonthEndStr = formatDate(prevMonthEnd);

  return {
    habitId: habit.id,
    completionRateAllTime: getCompletionRate(
      logs,
      [habit],
      creationDateStr,
      todayStr,
      habit.id,
      weeklyResetDay,
    ),
    completionRateCurrentMonth: getCompletionRate(
      logs,
      [habit],
      monthStartStr,
      todayStr,
      habit.id,
      weeklyResetDay,
    ),
    completionRatePreviousMonth: getCompletionRate(
      logs,
      [habit],
      prevMonthStartStr,
      prevMonthEndStr,
      habit.id,
      weeklyResetDay,
    ),
    streakProximity: getStreakProximity(habit),
    bestDayOfWeek: getBestWorstDays(logs, [habit], weeklyResetDay).best || 0,
    timeOfDayDistribution,
  };
}
