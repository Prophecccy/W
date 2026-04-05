import { describe, it, expect } from "vitest";
import { isHabitScheduledToday, getScheduledDaysInRange } from "./scheduleEngine";
import { Habit } from "../types";

// ─── Helper to build a minimal habit mock ─────────────────────
function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "test-habit",
    uid: "u1",
    title: "Test",
    description: "",
    icon: "star",
    color: "#fff",
    type: "standard",
    period: "daily",
    frequency: 1,
    daysOfWeek: [],
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
    createdAt: new Date("2026-01-01T00:00:00Z").getTime(),
    ...overrides,
  };
}

describe("isHabitScheduledToday", () => {
  it("daily habit is always scheduled", () => {
    const habit = makeHabit({ period: "daily" });
    expect(isHabitScheduledToday(habit, "2026-04-05")).toBe(true);
    expect(isHabitScheduledToday(habit, "2026-12-25")).toBe(true);
  });

  it("inactive habit is never scheduled", () => {
    const habit = makeHabit({ isActive: false });
    expect(isHabitScheduledToday(habit, "2026-04-05")).toBe(false);
  });

  it("endpoint duration past endDate returns false", () => {
    const habit = makeHabit({
      duration: { type: "endpoint", endDate: "2026-03-31" },
    });
    expect(isHabitScheduledToday(habit, "2026-04-01")).toBe(false);
    expect(isHabitScheduledToday(habit, "2026-03-31")).toBe(true);
  });

  it("weekly habit matches correct days", () => {
    // 2026-04-05 is a Sunday (day 0), 2026-04-06 is Monday (day 1)
    const habit = makeHabit({
      period: "weekly",
      daysOfWeek: [0, 3], // Sunday and Wednesday
    });
    expect(isHabitScheduledToday(habit, "2026-04-05")).toBe(true); // Sunday
    expect(isHabitScheduledToday(habit, "2026-04-06")).toBe(false); // Monday
    expect(isHabitScheduledToday(habit, "2026-04-08")).toBe(true); // Wednesday
  });

  it("monthly habit matches same day-of-month as creation", () => {
    const habit = makeHabit({
      period: "monthly",
      createdAt: new Date("2026-01-15T00:00:00Z").getTime(),
    });
    expect(isHabitScheduledToday(habit, "2026-04-15")).toBe(true);
    expect(isHabitScheduledToday(habit, "2026-04-16")).toBe(false);
  });

  it("interval habit fires every N days from creation", () => {
    const habit = makeHabit({
      period: "interval",
      intervalDays: 3,
      createdAt: new Date("2026-04-01T00:00:00Z").getTime(),
    });
    expect(isHabitScheduledToday(habit, "2026-04-01")).toBe(true); // Day 0
    expect(isHabitScheduledToday(habit, "2026-04-02")).toBe(false); // Day 1
    expect(isHabitScheduledToday(habit, "2026-04-04")).toBe(true); // Day 3
    expect(isHabitScheduledToday(habit, "2026-04-07")).toBe(true); // Day 6
  });

  it("interval habit with 0 intervalDays returns false", () => {
    const habit = makeHabit({
      period: "interval",
      intervalDays: 0,
    });
    expect(isHabitScheduledToday(habit, "2026-04-05")).toBe(false);
  });
});

describe("getScheduledDaysInRange", () => {
  it("returns all days for a daily habit", () => {
    const habit = makeHabit({ period: "daily" });
    const days = getScheduledDaysInRange(habit, "2026-04-01", "2026-04-05");
    expect(days).toHaveLength(5);
    expect(days[0]).toBe("2026-04-01");
    expect(days[4]).toBe("2026-04-05");
  });

  it("returns only matching days for weekly habit", () => {
    const habit = makeHabit({
      period: "weekly",
      daysOfWeek: [1], // Monday only
    });
    // April 2026: Mon 6, Mon 13
    const days = getScheduledDaysInRange(habit, "2026-04-01", "2026-04-14");
    expect(days).toContain("2026-04-06");
    expect(days).toContain("2026-04-13");
    expect(days).not.toContain("2026-04-05");
  });

  it("returns empty array for inactive habit", () => {
    const habit = makeHabit({ isActive: false });
    const days = getScheduledDaysInRange(habit, "2026-04-01", "2026-04-30");
    expect(days).toHaveLength(0);
  });

  it("handles single-day range", () => {
    const habit = makeHabit({ period: "daily" });
    const days = getScheduledDaysInRange(habit, "2026-04-05", "2026-04-05");
    expect(days).toEqual(["2026-04-05"]);
  });
});
