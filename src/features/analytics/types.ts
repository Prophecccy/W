import { Habit } from "../habits/types";

export interface InsightCard {
  id: string;
  title: string;
  value: string;
  subValue: string;
  icon: string; // Lucide icon name
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: string; // hex for coloring
}

export interface DayActivity {
  date: string; // YYYY-MM-DD
  completionRate: number; // 0-100
  totalScheduled: number;
  totalCompleted: number;
}

export interface HabitAnalytics {
  habitId: string;
  completionRateAllTime: number;
  completionRateCurrentMonth: number;
  completionRatePreviousMonth: number;
  streakProximity: number; // longest - current
  bestDayOfWeek: number; // 0=Sun, 1=Mon
  timeOfDayDistribution: number[]; // 24 buckets representing hours (0-23)
}

export interface WeeklySummary {
  startDate: string;
  endDate: string;
  completionRate: number;
  previousWeekCompletionRate: number;
  days: DayActivity[];
  bestDay: DayActivity | null;
  worstDay: DayActivity | null;
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  completionRate: number;
  previousMonthCompletionRate: number;
  days: DayActivity[];
  mostConsistent: Habit | null;
  mostImproved: Habit | null;
}
