import { Todo } from "../types";
import { addStrike } from "../../strikes/services/strikeService";
import { updateTodo } from "./todoService";
import { getToday, formatDate } from "../../../shared/utils/dateUtils";
import { getFreezeState, isDateInFreezeRange } from "../../freeze/services/freezeService";

/**
 * Checks for past-due deadline todos and applies strikes.
 * Modifies the todo to clear the deadline so it doesn't repeatedly apply strikes,
 * OR we can rely on checking strike history. To be safe, checking strike history
 * prevents duplicate strikes, but for now we will clear the deadline so it falls back to standard todo.
 */
export async function checkDeadlines(
  todos: Todo[],
  userResetTime?: string,
  today: string = getToday(undefined, userResetTime)
): Promise<number> {
  let strikesAdded = 0;
  
  let freezeState: any = null;
  try {
    freezeState = await getFreezeState();
  } catch (err) {
    console.warn("[deadlineChecker] Failed to fetch freeze state:", err);
  }
  
  for (const todo of todos) {
    const wasActiveOnDay = todo.status === "active" || (todo.status === "done" && todo.completedAt && formatDate(new Date(todo.completedAt)) >= today);
    if (!wasActiveOnDay) continue;
    if (todo.future && todo.future > today) continue; // Skip future (hidden) todos
    if (!todo.deadline) continue;

    // String comparison works for YYYY-MM-DD
    if (todo.deadline < today) {
      // BUG 6: Skip applying strikes or clearing deadlines if the deadline date is within a freeze range
      if (freezeState && isDateInFreezeRange(freezeState, todo.deadline)) {
        continue;
      }
      try {
        await addStrike(todo.id, todo.title, "missed");
        strikesAdded++;
        
        // Remove deadline so it doesn't trigger again, turning it into a normal active todo
        // (Alternatively, we could mark it as failed/done, but specs don't state that).
        await updateTodo(todo.id, { deadline: null });
        todo.deadline = null; // Clear locally in-place to prevent duplicates in chronological loops
      } catch (e) {
        console.error("Failed to add strike for missed todo:", todo.title, e);
      }
    }
  }

  return strikesAdded;
}
