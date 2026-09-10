import { describe, it, expect } from "vitest";
import {
  getIntervalHabitCompletionRate,
  getCompletionRate,
  generateHabitAnalytics,
} from "./analyticsService";
import { Habit, HabitLog } from "../../habits/types";

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "interval-habit-1",
    uid: "u1",
    title: "Gym Every 3 Days",
    description: "",
    icon: "Dumbbell",
    color: "#ff2d55",
    type: "standard",
    period: "interval",
    frequency: 1,
    daysOfWeek: [],
    intervalDays: 3,
    duration: { type: "continuing" },
    metric: null,
    isActive: true,
    group: null,
    order: 0,
    level: 1,
    totalCompletions: 3,
    levelProgress: 0,
    currentStreak: 3,
    longestStreak: 3,
    lastCompletedDate: "2026-08-10",
    startDate: "2026-08-01",
    archivedAt: null,
    createdAt: new Date("2026-08-01T00:00:00Z").getTime(),
    ...overrides,
  };
}

describe("Interval Habit Analytics", () => {
  const habit = makeHabit();

  const logs: HabitLog[] = [
    {
      date: "2026-08-01",
      uid: "u1",
      habits: {
        "interval-habit-1": {
          completed: true,
          value: 1,
          target: 1,
          completions: [{ timestamp: new Date("2026-08-01T10:00:00").getTime(), value: 1 }],
        },
      },
    },
    {
      date: "2026-08-04",
      uid: "u1",
      habits: {
        "interval-habit-1": {
          completed: true,
          value: 1,
          target: 1,
          completions: [{ timestamp: new Date("2026-08-04T15:30:00").getTime(), value: 1 }],
        },
      },
    },
    {
      date: "2026-08-07",
      uid: "u1",
      habits: {
        "interval-habit-1": {
          completed: true,
          value: 1,
          target: 1,
          completions: [{ timestamp: new Date("2026-08-07T20:00:00").getTime(), value: 1 }],
        },
      },
    },
    {
      date: "2026-08-10",
      uid: "u1",
      habits: {
        "interval-habit-1": {
          completed: true,
          value: 1,
          target: 1,
          completions: [{ timestamp: new Date("2026-08-10T08:00:00").getTime(), value: 1 }],
        },
      },
    },
  ];

  it("calculates accurate completion rate over a date range", () => {
    // Range 2026-08-01 to 2026-08-10 (10 days). Interval is 3 days -> expected completions = round(10/3) = 3.
    // Actual completions = 4.
    // Rate = min(100, round(4/3 * 100)) = 100%.
    const rate = getIntervalHabitCompletionRate(logs, habit, "2026-08-01", "2026-08-10");
    expect(rate).toBe(100);
  });

  it("calculates partial completion rate accurately", () => {
    // Range 2026-08-01 to 2026-08-31 (31 days). Interval is 3 days -> expected completions = round(31/3) = 10.
    // Actual completions in range = 4.
    // Rate = round(4/10 * 100) = 40%.
    const rate = getIntervalHabitCompletionRate(logs, habit, "2026-08-01", "2026-08-31");
    expect(rate).toBe(40);
  });

  it("returns 0% if no completions exist in range", () => {
    const rate = getIntervalHabitCompletionRate([], habit, "2026-08-01", "2026-08-31");
    expect(rate).toBe(0);
  });

  it("routes interval habits properly through getCompletionRate", () => {
    const rate = getCompletionRate(logs, [habit], "2026-08-01", "2026-08-31", habit.id);
    expect(rate).toBe(40);
  });

  it("generates habit analytics with time of day distribution and rates", () => {
    const analytics = generateHabitAnalytics(habit, logs);
    expect(analytics.habitId).toBe(habit.id);
    // Hourly distribution: 10am (hour 10), 3:30pm (hour 15), 8pm (hour 20), 8am (hour 8)
    expect(analytics.timeOfDayDistribution[8]).toBe(1);
    expect(analytics.timeOfDayDistribution[10]).toBe(1);
    expect(analytics.timeOfDayDistribution[15]).toBe(1);
    expect(analytics.timeOfDayDistribution[20]).toBe(1);
    expect(analytics.completionRateAllTime).toBeGreaterThan(0);
  });
});
