import { Todo } from "../types";
import { addStrike } from "../../strikes/services/strikeService";
import { updateTodo } from "./todoService";
import { getToday } from "../../../shared/utils/dateUtils";

/**
 * Checks for past-due deadline todos and applies strikes.
 * Modifies the todo to clear the deadline so it doesn't repeatedly apply strikes,
 * OR we can rely on checking strike history. To be safe, checking strike history
 * prevents duplicate strikes, but for now we will clear the deadline so it falls back to standard todo.
 */
export async function checkDeadlines(todos: Todo[], today: string = getToday()): Promise<number> {
  let strikesAdded = 0;
  
  for (const todo of todos) {
    if (todo.status !== "active") continue;
    if (!todo.deadline) continue;

    // String comparison works for YYYY-MM-DD
    if (todo.deadline < today) {
      try {
        await addStrike(todo.id, todo.title, "missed");
        strikesAdded++;
        
        // Remove deadline so it doesn't trigger again, turning it into a normal active todo
        // (Alternatively, we could mark it as failed/done, but specs don't state that).
        await updateTodo(todo.id, { deadline: null });
      } catch (e) {
        console.error("Failed to add strike for missed todo:", todo.title, e);
      }
    }
  }

  return strikesAdded;
}
