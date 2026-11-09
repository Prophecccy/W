import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calculateStreak } from "./streakEngine";
import { Habit, HabitLog } from "../types";

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    uid: "u1",
    title: "Habit 1",
    description: "",
    icon: "star",
    color: "#fff",
    type: "standard",
    period: "specific_days",
    frequency: 1,
    daysOfWeek: [1, 4], // Mon (1) and Thu (4)
    intervalDays: 0,
    duration: { type: "continuing" },
    metric: null,
    isActive: true,
    group: null,
    order: 0,
    level: 0,
    totalCompletions: 0,
    levelProgress: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletedDate: null,
    archivedAt: null,
    createdAt: new Date("2026-04-01T00:00:00Z").getTime(),
    startDate: "2026-04-01",
    ...overrides,
  };
}

function makeLog(date: string, completed = true, value = 1, target = 1): HabitLog {
  return {
    uid: "u1",
    date,
    habits: {
      "habit-1": {
        completed,
        value,
        target,
        completions: [{ timestamp: Date.now(), value }],
      },
    },
  };
}

describe("calculateStreak - specific_days", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates streak correctly across scheduled days, ignoring rest days", () => {
    // 2026-04-06 = Mon, 2026-04-09 = Thu, 2026-04-13 = Mon
    // Set system time to Mon 2026-04-13
    vi.setSystemTime(new Date("2026-04-13T12:00:00"));

    const habit = makeHabit({
      daysOfWeek: [1, 4],
      startDate: "2026-04-01",
    });

    const logs: HabitLog[] = [
      makeLog("2026-04-06", true),
      makeLog("2026-04-09", true),
      makeLog("2026-04-13", true),
    ];

    expect(calculateStreak(habit, logs)).toBe(3);
  });

  it("preserves streak on non-scheduled rest days", () => {
    // 2026-04-06 = Mon, 2026-04-09 = Thu, 2026-04-10 = Fri (rest day)
    // Set system time to Fri 2026-04-10 (not a scheduled day)
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));

    const habit = makeHabit({
      daysOfWeek: [1, 4],
      startDate: "2026-04-01",
    });

    const logs: HabitLog[] = [
      makeLog("2026-04-06", true),
      makeLog("2026-04-09", true),
    ];

    // Rest day: should still be 2
    expect(calculateStreak(habit, logs)).toBe(2);
  });

  it("grants grace period if today is scheduled but not yet completed", () => {
    // 2026-04-06 = Mon, 2026-04-09 = Thu (today, scheduled, not yet completed)
    vi.setSystemTime(new Date("2026-04-09T09:00:00"));

    const habit = makeHabit({
      daysOfWeek: [1, 4],
      startDate: "2026-04-01",
    });

    const logs: HabitLog[] = [
      makeLog("2026-04-06", true),
      makeLog("2026-04-09", false),
    ];

    // Grace period for today: streak stays at 1 from Monday
    expect(calculateStreak(habit, logs)).toBe(1);
  });

  it("breaks streak if a prior scheduled day was missed", () => {
    // 2026-04-06 = Mon (completed), 2026-04-09 = Thu (missed), 2026-04-13 = Mon (completed)
    vi.setSystemTime(new Date("2026-04-13T12:00:00"));

    const habit = makeHabit({
      daysOfWeek: [1, 4],
      startDate: "2026-04-01",
    });

    const logs: HabitLog[] = [
      makeLog("2026-04-06", true),
      makeLog("2026-04-09", false),
      makeLog("2026-04-13", true),
    ];

    // Streak is 1 because Thu 2026-04-09 broke it
    expect(calculateStreak(habit, logs)).toBe(1);
  });

  it("calculates limiter habit streak correctly for specific_days", () => {
    // 2026-04-06 = Mon, 2026-04-09 = Thu, 2026-04-13 = Mon
    vi.setSystemTime(new Date("2026-04-13T12:00:00"));

    const habit = makeHabit({
      type: "limiter",
      period: "specific_days",
      daysOfWeek: [1, 4],
      startDate: "2026-04-06",
    });

    const logs: HabitLog[] = [
      makeLog("2026-04-06", true, 0, 1),
      makeLog("2026-04-09", true, 1, 1),
      makeLog("2026-04-13", true, 0, 1),
    ];

    expect(calculateStreak(habit, logs)).toBe(3);
  });

  it("breaks limiter habit streak on scheduled day exceeding target", () => {
    // 2026-04-06 = Mon (target 1, value 0), 2026-04-09 = Thu (target 1, value 2 -> violated), 2026-04-13 = Mon (value 0)
    vi.setSystemTime(new Date("2026-04-13T12:00:00"));

    const habit = makeHabit({
      type: "limiter",
      period: "specific_days",
      daysOfWeek: [1, 4],
      startDate: "2026-04-01",
    });

    const logs: HabitLog[] = [
      makeLog("2026-04-06", true, 0, 1),
      makeLog("2026-04-09", true, 2, 1), // Violation
      makeLog("2026-04-13", true, 0, 1),
    ];

    // Streak is 1 because 2026-04-09 broke it
    expect(calculateStreak(habit, logs)).toBe(1);
  });
});
