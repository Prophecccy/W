import { Todo } from "../types";
import { addStrike } from "../../strikes/services/strikeService";
import { updateTodo, purgeOldCompletedTodos } from "./todoService";
import { getToday } from "../../../shared/utils/dateUtils";
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
    const wasActiveOnDay = todo.status === "active" || (todo.status === "done" && todo.completedAt && getToday(new Date(todo.completedAt), userResetTime) >= today);
    if (!wasActiveOnDay) continue;
    if (todo.future && todo.future > today) continue; // Skip future (hidden) todos
    if (!todo.deadline) continue;
    if (todo.strikeIssued) continue; // Skip if a strike has already been issued for this todo

    // String comparison works for YYYY-MM-DD
    if (todo.deadline < today) {
      // BUG 6: Skip applying strikes or clearing deadlines if the deadline date is within a freeze range
      if (freezeState && isDateInFreezeRange(freezeState, todo.deadline)) {
        continue;
      }
      try {
        const completedTimestamp = new Date(today + "T12:00:00").getTime();
        // Handle post-deadline action (Update DB first to prevent duplicate strikes on write timeouts)
        if (todo.postDeadlineAction === "disappear") {
          // Vanish: mark as done and record strikeIssued to prevent future checks
          const updates: any = { status: "done", completedAt: completedTimestamp, strikeIssued: true };
          if (todo.type === "numbered" && todo.numbered) {
            updates.numbered = {
              ...todo.numbered,
              current: todo.numbered.target
            };
          }
          await updateTodo(todo.id, updates);
          todo.status = "done";
          todo.completedAt = completedTimestamp;
          todo.strikeIssued = true;
          if (todo.type === "numbered" && todo.numbered) {
            todo.numbered = {
              ...todo.numbered,
              current: todo.numbered.target
            };
          }
          await purgeOldCompletedTodos();
        } else {
          // Keep: keep on board (active + keeps deadline), but mark strikeIssued to prevent duplicate strikes
          await updateTodo(todo.id, { strikeIssued: true });
          todo.strikeIssued = true;
        }

        // Apply strike after successful database state lock
        await addStrike(todo.id, todo.title, "missed");
        strikesAdded++;
      } catch (e) {
        console.error("Failed to process missed todo:", todo.title, e);
      }
    }
  }

  return strikesAdded;
}
