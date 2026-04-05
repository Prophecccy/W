import { getLogRange } from "../../habits/services/logService";
import { Habit, HabitLog } from "../../habits/types";
import { DayActivity, HabitAnalytics, MonthlySummary, WeeklySummary } from "../types";

// Helpers
const getDayOfWeek = (dateString: string) => new Date(dateString).getDay();

export function getCompletionRate(logs: HabitLog[], habitId?: string): number {
  if (logs.length === 0) return 0;

  let scheduled = 0;
  let completed = 0;

  for (const log of logs) {
    if (habitId) {
      if (log.habits[habitId]) {
        scheduled += 1;
        if (log.habits[habitId].completed) completed += 1;
      }
    } else {
      const habitIds = Object.keys(log.habits);
      scheduled += habitIds.length;
      for (const id of habitIds) {
        if (log.habits[id].completed) completed += 1;
      }
    }
  }

  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}

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
    const rate = stats.scheduled === 0 ? 0 : (stats.completed / stats.scheduled) * 100;
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

export function getMostConsistent(habits: Habit[], logs: HabitLog[]): Habit | null {
  let highestRate = -1;
  let mostConsistent: Habit | null = null;

  for (const habit of habits) {
    const rate = getCompletionRate(logs, habit.id);
    if (rate > highestRate && habit.totalCompletions > 5) { // Needs some baseline
      highestRate = rate;
      mostConsistent = habit;
    }
  }

  return mostConsistent;
}

export function getMostImproved(habits: Habit[], logs: HabitLog[]): Habit | null {
  // We need to split logs into two halves roughly to figure out "improvement"
  if (logs.length < 14) return null; // Need at least 2 weeks
  
  const midPoint = Math.floor(logs.length / 2);
  const firstHalf = logs.slice(0, midPoint);
  const secondHalf = logs.slice(midPoint);

  let highestImprovement = -1;
  let mostImproved: Habit | null = null;

  for (const habit of habits) {
    const rate1 = getCompletionRate(firstHalf, habit.id);
    const rate2 = getCompletionRate(secondHalf, habit.id);
    const improvement = rate2 - rate1;

    if (improvement > highestImprovement && rate2 > 0) {
      highestImprovement = improvement;
      mostImproved = habit;
    }
  }

  return mostImproved;
}

function processDayActivities(logs: HabitLog[]): DayActivity[] {
  return logs.map((log) => {
    let scheduled = 0;
    let completed = 0;
    const habitIds = Object.keys(log.habits);
    scheduled += habitIds.length;

    for (const id of habitIds) {
      if (log.habits[id].completed) completed += 1;
    }

    return {
      date: log.date,
      totalScheduled: scheduled,
      totalCompleted: completed,
      completionRate: scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100),
    };
  });
}

export async function generateWeeklySummary(
  startDate: string,
  endDate: string,
  previousStartDate: string,
  previousEndDate: string
): Promise<WeeklySummary> {
  const currentLogs = await getLogRange(startDate, endDate);
  const prevLogs = await getLogRange(previousStartDate, previousEndDate);

  const days = processDayActivities(currentLogs);
  let bestDay: DayActivity | null = null;
  let worstDay: DayActivity | null = null;

  if (days.length > 0) {
    let max = -1;
    let min = 101;
    for (const day of days) {
      if (day.totalScheduled > 0) {
        if (day.completionRate > max) { max = day.completionRate; bestDay = day; }
        if (day.completionRate < min) { min = day.completionRate; worstDay = day; }
      }
    }
  }

  return {
    startDate,
    endDate,
    completionRate: getCompletionRate(currentLogs),
    previousWeekCompletionRate: getCompletionRate(prevLogs),
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
  habits: Habit[]
): Promise<MonthlySummary> {
  const currentLogs = await getLogRange(startDate, endDate);
  const prevLogs = await getLogRange(previousStartDate, previousEndDate);

  return {
    month: startDate.substring(0, 7), // YYYY-MM
    completionRate: getCompletionRate(currentLogs),
    previousMonthCompletionRate: getCompletionRate(prevLogs),
    days: processDayActivities(currentLogs),
    mostConsistent: getMostConsistent(habits, currentLogs),
    mostImproved: getMostImproved(habits, currentLogs),
  };
}

export function generateHabitAnalytics(habit: Habit, logs: HabitLog[]): HabitAnalytics {
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

  const midPoint = Math.floor(logs.length / 2);
  const firstHalf = logs.slice(0, midPoint);
  const secondHalf = logs.slice(midPoint);

  return {
    habitId: habit.id,
    completionRateAllTime: getCompletionRate(logs, habit.id),
    completionRateCurrentMonth: getCompletionRate(secondHalf, habit.id),
    completionRatePreviousMonth: getCompletionRate(firstHalf, habit.id), // Loose approximation mapping halves
    streakProximity: getStreakProximity(habit),
    bestDayOfWeek: getBestWorstDays(logs).best || 0,
    timeOfDayDistribution,
  };
}
