import type { Habit } from "../../features/habits/types";
import type { Todo, TodoPriority } from "../../features/todos/types";
import { PRIORITY_CONFIG } from "../../features/todos/types";

export type ParsedActionType =
  | "CREATE_TODO"
  | "DELETE_TODO"
  | "CREATE_HABIT"
  | "DELETE_HABIT";

export interface ParsedCommand {
  type: ParsedActionType;
  title: string;
  badgeText: string;
  detailsHint?: string;
  dueDate?: string; // YYYY-MM-DD
  dueDateLabel?: string;
  priority?: TodoPriority;
  period?: "daily" | "weekly";
  targetHabit?: Habit;
  targetTodo?: Todo;
  summary: string;
  details: string[];
}

// ─── Date Parsing Helpers ─────────────────────────────────────────

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function parseRelativeDate(text: string): { cleanedText: string; dueDate?: string; label?: string } {
  const lower = text.toLowerCase();
  const now = new Date();

  // 1. "today" or "tonight"
  if (/\b(today|tonight)\b/i.test(lower)) {
    const cleaned = text.replace(/\b(today|tonight)\b/gi, "").trim();
    return { cleanedText: cleaned, dueDate: formatDate(now), label: "Today" };
  }

  // 2. "tomorrow"
  if (/\btomorrow\b/i.test(lower)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const cleaned = text.replace(/\b(for|by|on)?\s*tomorrow\b/gi, "").trim();
    return { cleanedText: cleaned, dueDate: formatDate(tomorrow), label: "Tomorrow" };
  }

  // 3. "in X days"
  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/i);
  if (inDaysMatch) {
    const daysToAdd = parseInt(inDaysMatch[1], 10);
    const target = new Date(now);
    target.setDate(target.getDate() + daysToAdd);
    const cleaned = text.replace(new RegExp(`\\b(in\\s+${daysToAdd}\\s+days?)\\b`, "gi"), "").trim();
    return {
      cleanedText: cleaned,
      dueDate: formatDate(target),
      label: `In ${daysToAdd} days (${formatDate(target)})`,
    };
  }

  // 4. "by/on/this/next [day of week]"
  for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
    const dayName = DAYS_OF_WEEK[i];
    const dayRegex = new RegExp(`\\b(?:by|on|this|next)?\\s*(${dayName})\\b`, "i");
    const match = lower.match(dayRegex);
    if (match) {
      const currentDay = now.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7; // Next occurrence
      const target = new Date(now);
      target.setDate(target.getDate() + diff);

      const cleaned = text.replace(dayRegex, "").trim();
      const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      return {
        cleanedText: cleaned,
        dueDate: formatDate(target),
        label: `${capDay} (${formatDate(target)})`,
      };
    }
  }

  return { cleanedText: text };
}

// ─── Priority Parsing Helpers ─────────────────────────────────────

function parsePriority(text: string): { cleanedText: string; priority: TodoPriority } {
  let cleaned = text;

  // P1 - Critical / Urgent
  if (/\b(urgent|critical|p1|priority 1|p:critical)\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/\b(urgent|critical|p1|priority 1|p:critical)\b/gi, "").trim();
    return { cleanedText: cleaned, priority: "p1" };
  }

  // P2 - High Priority / Important / Strategic
  if (/\b(high priority|important|strategic|p2|priority 2|p:high)\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/\b(high priority|important|strategic|p2|priority 2|p:high)\b/gi, "").trim();
    return { cleanedText: cleaned, priority: "p2" };
  }

  // P4 - Low / Backlog / Minor
  if (/\b(low priority|p4|priority 4|backlog|minor|p:low)\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/\b(low priority|p4|priority 4|backlog|minor|p:low)\b/gi, "").trim();
    return { cleanedText: cleaned, priority: "p4" };
  }

  // P3 - Routine / Daily / Medium / Normal
  if (/\b(medium priority|routine|daily|p3|priority 3|normal priority|p:med|p:medium)\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/\b(medium priority|routine|daily|p3|priority 3|normal priority|p:med|p:medium)\b/gi, "").trim();
    return { cleanedText: cleaned, priority: "p3" };
  }

  return { cleanedText: cleaned, priority: "p3" };
}

// ─── Recurrence Parsing Helpers (Habits) ──────────────────────────

function parseRecurrence(text: string): { cleanedText: string; period: "daily" | "weekly" } {
  let cleaned = text;
  if (/\b(weekly|every week|each week|once a week)\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/\b(weekly|every week|each week|once a week)\b/gi, "").trim();
    return { cleanedText: cleaned, period: "weekly" };
  }

  if (/\b(daily|every day|everyday|each day)\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/\b(daily|every day|everyday|each day)\b/gi, "").trim();
    return { cleanedText: cleaned, period: "daily" };
  }

  return { cleanedText: cleaned, period: "daily" };
}

// ─── Fuzzy / Substring Entity Matcher ──────────────────────────────

function findBestHabit(targetName: string, habits: Habit[]): Habit | undefined {
  const norm = targetName.toLowerCase().trim();
  if (!norm) return undefined;

  // 1. Exact match
  const exact = habits.find((h) => h.title.toLowerCase() === norm);
  if (exact) return exact;

  // 2. Starts with
  const startsWith = habits.find((h) => h.title.toLowerCase().startsWith(norm));
  if (startsWith) return startsWith;

  // 3. Includes substring
  return habits.find((h) => h.title.toLowerCase().includes(norm));
}

function findBestTodo(targetName: string, todos: Todo[]): Todo | undefined {
  const norm = targetName.toLowerCase().trim();
  if (!norm) return undefined;

  // 1. Exact match
  const exact = todos.find((t) => t.title.toLowerCase() === norm);
  if (exact) return exact;

  // 2. Starts with
  const startsWith = todos.find((t) => t.title.toLowerCase().startsWith(norm));
  if (startsWith) return startsWith;

  // 3. Includes substring
  return todos.find((t) => t.title.toLowerCase().includes(norm));
}

// ─── Main Natural Language Parser ──────────────────────────────────

export function parseNaturalCommand(
  rawQuery: string,
  habits: Habit[] = [],
  todos: Todo[] = []
): ParsedCommand | null {
  const input = rawQuery.trim();
  if (input.length < 3) return null;

  const lower = input.toLowerCase();

  // ─── 1. DELETE / REMOVE INTENT ─────────────────────────────────
  const deletePrefixes = [
    "delete ",
    "del ",
    "remove ",
    "rm ",
    "cancel ",
    "drop ",
  ];

  for (const prefix of deletePrefixes) {
    if (lower.startsWith(prefix)) {
      let rest = input.slice(prefix.length).trim();
      let explicitType: "habit" | "todo" | null = null;

      if (rest.toLowerCase().startsWith("habit ")) {
        explicitType = "habit";
        rest = rest.slice(6).trim();
      } else if (rest.toLowerCase().startsWith("todo ") || rest.toLowerCase().startsWith("task ")) {
        explicitType = "todo";
        rest = rest.slice(rest.toLowerCase().startsWith("todo ") ? 5 : 5).trim();
      }

      if (!rest) continue;

      if (explicitType === "habit") {
        const h = findBestHabit(rest, habits);
        if (h) {
          return {
            type: "DELETE_HABIT",
            title: h.title,
            badgeText: "DELETE HABIT",
            detailsHint: "Warning: Permanently delete habit",
            targetHabit: h,
            summary: `Delete Habit: "${h.title}"`,
            details: [`Warning: Permanently removes habit "${h.title}"`, "Logged to Undo history"],
          };
        }
      } else if (explicitType === "todo") {
        const t = findBestTodo(rest, todos);
        if (t) {
          return {
            type: "DELETE_TODO",
            title: t.title,
            badgeText: "DELETE TASK",
            detailsHint: "Warning: Permanently delete task",
            targetTodo: t,
            summary: `Delete Todo: "${t.title}"`,
            details: [`Warning: Permanently removes task "${t.title}"`, "Logged to Undo history"],
          };
        }
      } else {
        const h = findBestHabit(rest, habits);
        const t = findBestTodo(rest, todos);

        if (t && (!h || t.title.length <= h.title.length)) {
          return {
            type: "DELETE_TODO",
            title: t.title,
            badgeText: "DELETE TASK",
            detailsHint: "Warning: Permanently delete task",
            targetTodo: t,
            summary: `Delete Todo: "${t.title}"`,
            details: [`Warning: Removes task "${t.title}"`, "Logged to Undo history"],
          };
        } else if (h) {
          return {
            type: "DELETE_HABIT",
            title: h.title,
            badgeText: "DELETE HABIT",
            detailsHint: "Warning: Permanently delete habit",
            targetHabit: h,
            summary: `Delete Habit: "${h.title}"`,
            details: [`Warning: Removes habit "${h.title}"`, "Logged to Undo history"],
          };
        }
      }
    }
  }

  // ─── 2. CREATE HABIT INTENT ────────────────────────────────────
  const habitPrefixes = [
    "new habit ",
    "add habit ",
    "create habit ",
    "make habit ",
    "habit ",
    "new routine ",
    "add routine ",
  ];

  for (const prefix of habitPrefixes) {
    if (lower.startsWith(prefix)) {
      const rest = input.slice(prefix.length).trim();
      if (!rest) continue;

      const { cleanedText: textNoRecurrence, period } = parseRecurrence(rest);
      const cleanTitle = textNoRecurrence.trim();
      if (!cleanTitle) continue;

      return {
        type: "CREATE_HABIT",
        title: cleanTitle,
        badgeText: "CREATE HABIT",
        detailsHint: `Recurrence: ${(period || "daily").toUpperCase()} · Target: 1/day`,
        period,
        summary: `Create Habit: "${cleanTitle}"`,
        details: [
          `Recurrence: ${period.toUpperCase()}`,
          "Target: 1 completion per period",
          "Color: Default Endfield Blue (#5B8DEF)",
        ],
      };
    }
  }

  // ─── 3. CREATE TODO INTENT ─────────────────────────────────────
  const todoPrefixes = [
    "new todo ",
    "add todo ",
    "create todo ",
    "todo ",
    "new task ",
    "add task ",
    "create task ",
    "task ",
    "remind me to ",
    "add ",
    "new ",
  ];

  for (const prefix of todoPrefixes) {
    if (lower.startsWith(prefix)) {
      let rest = input.slice(prefix.length).trim();
      if (rest.toLowerCase().startsWith("todo ") || rest.toLowerCase().startsWith("task ")) {
        rest = rest.slice(rest.toLowerCase().startsWith("todo ") ? 5 : 5).trim();
      }
      if (!rest) continue;

      // Extract Priority
      const { cleanedText: textNoPriority, priority } = parsePriority(rest);

      // Extract Relative Date
      const { cleanedText: textNoDate, dueDate, label: dateLabel } = parseRelativeDate(textNoPriority);

      // Clean remaining text for the title
      const cleanTitle = textNoDate.replace(/\s+/g, " ").trim();
      if (!cleanTitle) continue;

      const details: string[] = [];
      if (dueDate && dateLabel) {
        details.push(`Due: ${dateLabel}`);
      } else {
        details.push("Due: No due date");
      }
      const tierInfo = PRIORITY_CONFIG[priority];
      details.push(`Priority: ${tierInfo.label}`);

      return {
        type: "CREATE_TODO",
        title: cleanTitle,
        badgeText: "CREATE TASK",
        detailsHint: details.join(" · "),
        dueDate,
        dueDateLabel: dateLabel,
        priority,
        summary: `Create Todo: "${cleanTitle}"`,
        details,
      };
    }
  }

  return null;
}
