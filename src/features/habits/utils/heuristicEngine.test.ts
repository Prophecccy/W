import { describe, it, expect } from "vitest";
import { calculateRisk } from "./heuristicEngine";
import type { Habit, HabitLog } from "../types";

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
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
    isArchived: false,
    archivedAt: null,
    createdAt: new Date("2026-05-01T00:00:00Z").getTime(),
    ...overrides,
  };
}

function makeLog(date: string, habitId: string, completed: boolean, completionTimestamp?: number): HabitLog {
  return {
    date,
    uid: "u1",
    notes: "",
    habits: {
      [habitId]: {
        completed,
        value: completed ? 1 : 0,
        target: 1,
        completions:
          completed && typeof completionTimestamp === "number"
            ? [{ timestamp: completionTimestamp, value: 1 }]
            : [],
      },
    },
  };
}

describe("calculateRisk guardrails", () => {
  it("returns 0 for habits younger than 14 days", () => {
    const now = new Date("2026-05-19T12:00:00Z");
    const habit = makeHabit({ createdAt: now.getTime() - 13 * 24 * 3600 * 1000 });
    const logs: HabitLog[] = [
      makeLog("2026-05-10", habit.id, false),
      makeLog("2026-05-11", habit.id, true, new Date("2026-05-11T07:00:00Z").getTime()),
    ];

    const result = calculateRisk(habit, logs, "04:00", 5, now);
    expect(result.score).toBe(0);
    expect(result.timePressure).toBe(0);
    expect(result.variance).toBe(0);
    expect(result.loadFactor).toBe(0);
  });

  it("returns 0 for habits with less than 14 days of history", () => {
    const now = new Date("2026-05-19T12:00:00Z");
    const habit = makeHabit({ createdAt: now.getTime() - 20 * 24 * 3600 * 1000 });
    const logs: HabitLog[] = [];
    for (let i = 0; i < 13; i++) {
      logs.push(makeLog(`2026-05-${1 + i}`, habit.id, true));
    }

    const result = calculateRisk(habit, logs, "04:00", 5, now);
    expect(result.score).toBe(0);
  });

  it("does not treat reset time earlier in the day as an already-passed deadline", () => {
    const now = new Date("2026-05-19T09:00:00Z");
    const habit = makeHabit({ createdAt: now.getTime() - 20 * 24 * 3600 * 1000 });
    const result = calculateRisk(habit, [], "04:00", 1, now);
    expect(result.timePressure).toBeLessThan(5);
    expect(result.score).toBeLessThan(10);
  });
});

