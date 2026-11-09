import { describe, it, expect } from "vitest";
import { parseNaturalCommand } from "./naturalLanguageParser";
import type { Habit } from "../../features/habits/types";
import type { Todo } from "../../features/todos/types";

describe("naturalLanguageParser", () => {
  const sampleHabits: Habit[] = [
    {
      id: "h1",
      uid: "user1",
      title: "Morning Meditation",
      description: "",
      icon: "Target",
      color: "#5B8DEF",
      period: "daily",
      type: "standard",
      frequency: 1,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      intervalDays: 1,
      lastCompletedDate: null,
      metric: null,
      duration: { type: "continuing" },
      level: 1,
      totalCompletions: 5,
      levelProgress: 1,
      currentStreak: 3,
      longestStreak: 5,
      order: 0,
      group: null,
      isActive: true,
      archivedAt: null,
      createdAt: 1000,
    },
    {
      id: "h2",
      uid: "user1",
      title: "Gym Workout",
      description: "",
      icon: "Dumbbell",
      color: "#4ADE80",
      period: "weekly",
      frequency: 3,
      daysOfWeek: [1, 3, 5],
      intervalDays: 1,
      lastCompletedDate: null,
      metric: null,
      duration: { type: "continuing" },
      level: 2,
      totalCompletions: 12,
      levelProgress: 2,
      currentStreak: 2,
      longestStreak: 4,
      order: 1,
      group: null,
      isActive: true,
      archivedAt: null,
      createdAt: 1000,
      type: "standard",
    },
  ];

  const sampleTodos: Todo[] = [
    {
      id: "t1",
      uid: "user1",
      title: "Buy groceries for dinner",
      description: "",
      type: "standard",
      status: "active",
      color: "#5B8DEF",
      deadline: null,
      future: null,
      group: null,
      order: 0,
      completedAt: null,
      createdAt: 1000,
    },
    {
      id: "t2",
      uid: "user1",
      title: "Fix production bug",
      description: "",
      type: "standard",
      status: "active",
      color: "#ff4d4d",
      deadline: "2026-10-02",
      future: null,
      group: null,
      order: 1,
      completedAt: null,
      createdAt: 1000,
    },
  ];

  describe("CREATE_TODO", () => {
    it("parses simple 'new todo' command with default P3 priority", () => {
      const res = parseNaturalCommand("new todo Call the bank", sampleHabits, sampleTodos);
      expect(res).not.toBeNull();
      expect(res?.type).toBe("CREATE_TODO");
      expect(res?.title).toBe("Call the bank");
      expect(res?.badgeText).toBe("CREATE TASK");
      expect(res?.priority).toBe("p3");
    });

    it("parses relative date 'tomorrow' and priority 'urgent' as P1", () => {
      const res = parseNaturalCommand("new todo Submit quarterly taxes tomorrow urgent", sampleHabits, sampleTodos);
      expect(res).not.toBeNull();
      expect(res?.type).toBe("CREATE_TODO");
      expect(res?.title).toBe("Submit quarterly taxes");
      expect(res?.priority).toBe("p1");
      expect(res?.dueDateLabel).toBe("Tomorrow");
      expect(res?.dueDate).toBeDefined();
    });

    it("parses shorthand 'todo' with priority 'p1'", () => {
      const res = parseNaturalCommand("todo Review pull request p1", sampleHabits, sampleTodos);
      expect(res).not.toBeNull();
      expect(res?.type).toBe("CREATE_TODO");
      expect(res?.title).toBe("Review pull request");
      expect(res?.priority).toBe("p1");
    });

    it("parses priority 'p2' and 'high priority'", () => {
      const res = parseNaturalCommand("add task Prepare Q3 roadmap high priority", sampleHabits, sampleTodos);
      expect(res).not.toBeNull();
      expect(res?.type).toBe("CREATE_TODO");
      expect(res?.title).toBe("Prepare Q3 roadmap");
      expect(res?.priority).toBe("p2");
    });

    it("parses priority 'p4' and 'low priority' or 'backlog'", () => {
      const res = parseNaturalCommand("todo Reorganize desktop files p4", sampleHabits, sampleTodos);
      expect(res).not.toBeNull();
      expect(res?.type).toBe("CREATE_TODO");
      expect(res?.title).toBe("Reorganize desktop files");
      expect(res?.priority).toBe("p4");
    });
  });

  describe("CREATE_HABIT", () => {
    it("parses 'new habit' with daily recurrence", () => {
      const res = parseNaturalCommand("new habit Read 10 pages daily", sampleHabits, sampleTodos);
      expect(res).not.toBeNull();
      expect(res?.type).toBe("CREATE_HABIT");
      expect(res?.title).toBe("Read 10 pages");
      expect(res?.period).toBe("daily");
      expect(res?.badgeText).toBe("CREATE HABIT");
    });

    it("parses 'create habit' with weekly recurrence", () => {
      const res = parseNaturalCommand("create habit Deep clean room weekly", sampleHabits, sampleTodos);
      expect(res).not.toBeNull();
      expect(res?.type).toBe("CREATE_HABIT");
      expect(res?.title).toBe("Deep clean room");
      expect(res?.period).toBe("weekly");
    });
  });

  describe("DECOMMISSIONED COMPLETE INTENTS", () => {
    it("does not parse 'done meditation' as completion (returns null for tactile UI focus)", () => {
      const res = parseNaturalCommand("done meditation", sampleHabits, sampleTodos);
      expect(res).toBeNull();
    });

    it("does not parse 'check off groceries' as completion (returns null)", () => {
      const res = parseNaturalCommand("check off groceries", sampleHabits, sampleTodos);
      expect(res).toBeNull();
    });

    it("does not parse explicit 'done todo bug' as completion (returns null)", () => {
      const res = parseNaturalCommand("done todo bug", sampleHabits, sampleTodos);
      expect(res).toBeNull();
    });
  });

  describe("DELETE INTENTS", () => {
    it("identifies habit deletion via 'delete habit gym'", () => {
      const res = parseNaturalCommand("delete habit gym", sampleHabits, sampleTodos);
      expect(res).not.toBeNull();
      expect(res?.type).toBe("DELETE_HABIT");
      expect(res?.targetHabit?.id).toBe("h2");
      expect(res?.badgeText).toBe("DELETE HABIT");
    });

    it("identifies todo deletion via 'remove bug'", () => {
      const res = parseNaturalCommand("remove bug", sampleHabits, sampleTodos);
      expect(res).not.toBeNull();
      expect(res?.type).toBe("DELETE_TODO");
      expect(res?.targetTodo?.id).toBe("t2");
      expect(res?.badgeText).toBe("DELETE TASK");
    });
  });

  describe("NON-MATCHING INTENTS", () => {
    it("returns null for page navigation queries", () => {
      expect(parseNaturalCommand("dashboard", sampleHabits, sampleTodos)).toBeNull();
      expect(parseNaturalCommand("settings", sampleHabits, sampleTodos)).toBeNull();
      expect(parseNaturalCommand("habits", sampleHabits, sampleTodos)).toBeNull();
      expect(parseNaturalCommand("analytics", sampleHabits, sampleTodos)).toBeNull();
    });
  });
});
