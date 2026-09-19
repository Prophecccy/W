import { describe, it, expect } from "vitest";
import { Habit, HabitLog } from "../../habits/types";
import { getPeriodStart, isMultiDayMetric, getTotalInRange } from "../../../shared/utils/dateUtils";
import { isHabitScheduledToday, isHabitResting } from "../../habits/utils/scheduleEngine";

// Pure helper function reflecting the exact scheduling filter used in useWidgetData.ts
function isScheduledInWidget(
  habit: Habit,
  today: string,
  weeklyResetDay: number,
  periodLogs: HabitLog[],
  todayLog: HabitLog | null,
  dailyResetTime?: string
): boolean {
  if (!isHabitScheduledToday(habit, today, weeklyResetDay)) return false;
  if (isHabitResting(habit, dailyResetTime)) return false;
  if (habit.type === "limiter") return false;

  if (isMultiDayMetric(habit) && habit.metric) {
    const target = habit.metric.targetValue;
    const start = getPeriodStart(habit, today, weeklyResetDay);
    const total = getTotalInRange(periodLogs, habit.id, start);
    const periodCompleted = target > 0 && total >= target;
    const entry = todayLog?.habits?.[habit.id];
    const interactedToday = (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;
    if (periodCompleted && !interactedToday) {
      return false;
    }
  }

  return true;
}

// Pure helper function reflecting the exact getStatus logic used in WidgetHabitList.tsx
function getWidgetHabitStatus(
  habit: Habit,
  today: string,
  weeklyResetDay: number,
  periodLogs: HabitLog[],
  todayLog: HabitLog | null
) {
  const entry = todayLog?.habits?.[habit.id];
  const interactedToday = (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;

  if (isMultiDayMetric(habit)) {
    const target = habit.metric?.targetValue ?? 0;
    const start = getPeriodStart(habit, today, weeklyResetDay);
    const periodCompleted = target > 0 ? getTotalInRange(periodLogs, habit.id, start) >= target : false;
    const isCompletedToday = periodCompleted && interactedToday;
    const sortBucket = isCompletedToday ? 2 : interactedToday ? 1 : 0;
    return { sortBucket, isCompletedToday, doneToday: interactedToday && !periodCompleted };
  }

  const completedToday = entry?.completed === true;
  return { sortBucket: completedToday ? 2 : 0, isCompletedToday: completedToday, doneToday: false };
}

describe("Widget multi-day metric habit scheduling logic", () => {
  const gymHabit: Habit = {
    id: "habit-gym",
    uid: "user-1",
    title: "Gym",
    description: "3 times a week",
    icon: "dumbbell",
    color: "#ffaa00",
    type: "metric",
    period: "weekly",
    frequency: 3,
    daysOfWeek: [],
    intervalDays: 0,
    duration: { type: "continuing" },
    metric: {
      targetValue: 3,
      originalTarget: 3,
      unit: "sessions",
    },
    isActive: true,
    group: null,
    order: 0,
    level: 0,
    totalCompletions: 2,
    levelProgress: 0,
    currentStreak: 2,
    longestStreak: 5,
    lastCompletedDate: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z").getTime(),
  };

  const weeklyResetDay = 1; // Monday

  it("partially completed habit (2 of 3) remains scheduled on Friday when not yet finished", () => {
    const today = "2026-09-11"; // Friday
    const periodLogs: HabitLog[] = [
      { date: "2026-09-08", uid: "user-1", habits: { "habit-gym": { value: 1, completed: false, target: 3, completions: [{ timestamp: 100, value: 1 }] } } }, // Tuesday: 1
      { date: "2026-09-10", uid: "user-1", habits: { "habit-gym": { value: 1, completed: false, target: 3, completions: [{ timestamp: 200, value: 1 }] } } }, // Thursday: 1
    ];
    const todayLog: HabitLog = { date: today, uid: "user-1", habits: {} };

    const scheduled = isScheduledInWidget(gymHabit, today, weeklyResetDay, periodLogs, todayLog);
    expect(scheduled).toBe(true);

    const status = getWidgetHabitStatus(gymHabit, today, weeklyResetDay, periodLogs, todayLog);
    expect(status.isCompletedToday).toBe(false);
    expect(status.doneToday).toBe(false);
    expect(status.sortBucket).toBe(0);
  });

  it("completed on Friday (3rd workout today) remains scheduled on Friday as completed today", () => {
    const today = "2026-09-11"; // Friday
    const todayLog: HabitLog = {
      date: today,
      uid: "user-1",
      habits: {
        "habit-gym": {
          value: 1,
          completed: true,
          target: 3,
          completions: [{ timestamp: Date.now(), value: 1 }],
        },
      },
    };
    const periodLogs: HabitLog[] = [
      { date: "2026-09-08", uid: "user-1", habits: { "habit-gym": { value: 1, completed: false, target: 3, completions: [{ timestamp: 100, value: 1 }] } } }, // Tuesday
      { date: "2026-09-10", uid: "user-1", habits: { "habit-gym": { value: 1, completed: false, target: 3, completions: [{ timestamp: 200, value: 1 }] } } }, // Thursday
      todayLog, // Friday (reaches total 3)
    ];

    const scheduled = isScheduledInWidget(gymHabit, today, weeklyResetDay, periodLogs, todayLog);
    expect(scheduled).toBe(true);

    const status = getWidgetHabitStatus(gymHabit, today, weeklyResetDay, periodLogs, todayLog);
    expect(status.isCompletedToday).toBe(true);
    expect(status.doneToday).toBe(false);
    expect(status.sortBucket).toBe(2);
  });

  it("completed on Friday is EXCLUDED from widget on Saturday when not interacted today", () => {
    const today = "2026-09-12"; // Saturday
    const periodLogs: HabitLog[] = [
      { date: "2026-09-08", uid: "user-1", habits: { "habit-gym": { value: 1, completed: false, target: 3, completions: [{ timestamp: 100, value: 1 }] } } }, // Tuesday
      { date: "2026-09-10", uid: "user-1", habits: { "habit-gym": { value: 1, completed: false, target: 3, completions: [{ timestamp: 200, value: 1 }] } } }, // Thursday
      { date: "2026-09-11", uid: "user-1", habits: { "habit-gym": { value: 1, completed: true, target: 3, completions: [{ timestamp: 300, value: 1 }] } } }, // Friday
    ];
    // No gym logged on Saturday:
    const todayLog: HabitLog = { date: today, uid: "user-1", habits: {} };

    const scheduled = isScheduledInWidget(gymHabit, today, weeklyResetDay, periodLogs, todayLog);
    expect(scheduled).toBe(false); // MUST NOT BE SCHEDULED ON SATURDAY!

    const status = getWidgetHabitStatus(gymHabit, today, weeklyResetDay, periodLogs, todayLog);
    expect(status.isCompletedToday).toBe(false); // MUST NOT BE MARKED COMPLETED TODAY!
  });

  it("reappears automatically on Monday for the new weekly period", () => {
    const today = "2026-09-14"; // Monday (New week start)
    const periodLogs: HabitLog[] = [
      // Previous week logs (before Sept 14):
      { date: "2026-09-08", uid: "user-1", habits: { "habit-gym": { value: 1, completed: false, target: 3, completions: [{ timestamp: 100, value: 1 }] } } },
      { date: "2026-09-10", uid: "user-1", habits: { "habit-gym": { value: 1, completed: false, target: 3, completions: [{ timestamp: 200, value: 1 }] } } },
      { date: "2026-09-11", uid: "user-1", habits: { "habit-gym": { value: 1, completed: true, target: 3, completions: [{ timestamp: 300, value: 1 }] } } },
    ];
    const todayLog: HabitLog = { date: today, uid: "user-1", habits: {} };

    const scheduled = isScheduledInWidget(gymHabit, today, weeklyResetDay, periodLogs, todayLog);
    expect(scheduled).toBe(true); // Reappears for Monday!

    const status = getWidgetHabitStatus(gymHabit, today, weeklyResetDay, periodLogs, todayLog);
    expect(status.isCompletedToday).toBe(false);
    expect(status.doneToday).toBe(false);
    expect(status.sortBucket).toBe(0);
  });
});
