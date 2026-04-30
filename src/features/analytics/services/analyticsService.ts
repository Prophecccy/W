import { getLogRange } from "../../habits/services/logService";
import { Habit, HabitLog } from "../../habits/types";
import {
  DayActivity,
  HabitAnalytics,
  MonthlySummary,
  WeeklySummary,
} from "../types";
import { isHabitScheduledToday } from "../../habits/utils/scheduleEngine";

import { getToday, formatDate } from "../../../shared/utils/dateUtils";

export function getCompletionRate(
  logs: HabitLog[],
  habits: Habit[],
  startDateStr: string,
  endDateStr: string,
  habitId?: string,
): number {
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
      ? habits.filter((h) => h.id === habitId && isHabitScheduledToday(h, dStr))
      : habits.filter((h) => isHabitScheduledToday(h, dStr));

    const dayScheduled = scheduledHabits.length;
    let dayCompleted = 0;

    const log = logMap[dStr];
    if (log) {
      if (habitId) {
        if (log.habits[habitId]?.completed) dayCompleted = 1;
      } else {
        dayCompleted = scheduledHabits.filter(
          (h) => log.habits[h.id]?.completed,
        ).length;
      }
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

export function getBestWorstDays(logs: HabitLog[]): {
  best: number | null;
  worst: number | null;
  averages: Record<number, number>;
} {
  const dayStats: Record<number, { scheduled: number; completed: number }> = {};
  for (let i = 0; i < 7; i++) dayStats[i] = { scheduled: 0, completed: 0 };

  for (const log of logs) {
    const day = getDayOfWeek(log.date);
    const habitIds = Object.keys(log.habits);
    dayStats[day].scheduled += habitIds.length;

    for (const id of habitIds) {
      if (log.habits[id].completed) dayStats[day].completed += 1;
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
): Habit | null {
  const start = new Date(startDateStr + "T12:00:00");
  const end = new Date(endDateStr + "T12:00:00");
  const midMs = start.getTime() + (end.getTime() - start.getTime()) / 2;
  const midDateStr = formatDate(new Date(midMs));

  let highestImprovement = -1;
  let mostImproved: Habit | null = null;

  for (const habit of habits) {
    const rate1 = getCompletionRate(
      logs,
      habits,
      startDateStr,
      midDateStr,
      habit.id,
    );
    const rate2 = getCompletionRate(
      logs,
      habits,
      midDateStr,
      endDateStr,
      habit.id,
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
      isHabitScheduledToday(h, dStr),
    );
    const scheduled = scheduledHabits.length;
    let completed = 0;

    const log = logMap[dStr];
    if (log) {
      completed = scheduledHabits.filter(
        (h) => log.habits[h.id]?.completed,
      ).length;
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
): Promise<WeeklySummary> {
  const currentLogs = await getLogRange(startDate, endDate);
  const prevLogs = await getLogRange(previousStartDate, previousEndDate);

  const days = processDayActivities(currentLogs, habits, startDate, endDate);
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
    completionRate: getCompletionRate(currentLogs, habits, startDate, endDate),
    previousWeekCompletionRate: getCompletionRate(
      prevLogs,
      habits,
      previousStartDate,
      previousEndDate,
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
): Promise<MonthlySummary> {
  const currentLogs = await getLogRange(startDate, endDate);
  const prevLogs = await getLogRange(previousStartDate, previousEndDate);

  return {
    month: startDate.substring(0, 7), // YYYY-MM
    completionRate: getCompletionRate(currentLogs, habits, startDate, endDate),
    previousMonthCompletionRate: getCompletionRate(
      prevLogs,
      habits,
      previousStartDate,
      previousEndDate,
    ),
    days: processDayActivities(currentLogs, habits, startDate, endDate),
    mostConsistent: getMostConsistent(habits, currentLogs, startDate, endDate),
    mostImproved: getMostImproved(habits, currentLogs, startDate, endDate),
  };
}

export function generateHabitAnalytics(
  habit: Habit,
  logs: HabitLog[],
): HabitAnalytics {
  const timeOfDayDistribution = new Array(24).fill(0);

  for (const log of logs) {
    const entry = log.habits[habit.id];
    if (entry && entry.completed) {
      for (const comp of entry.completions) {
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
    ),
    completionRateCurrentMonth: getCompletionRate(
      logs,
      [habit],
      monthStartStr,
      todayStr,
      habit.id,
    ),
    completionRatePreviousMonth: getCompletionRate(
      logs,
      [habit],
      prevMonthStartStr,
      prevMonthEndStr,
      habit.id,
    ),
    streakProximity: getStreakProximity(habit),
    bestDayOfWeek: getBestWorstDays(logs).best || 0,
    timeOfDayDistribution,
  };
}
