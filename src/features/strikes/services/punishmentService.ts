import { PunishmentChoice } from "../types";
import { resetStrikes } from "./strikeService";
import { updateHabit } from "../../habits/services/habitService";
import { Habit } from "../../habits/types";

// ─── Apply Punishment ────────────────────────────────────────────
// Each choice has a side effect. "add_habit" and "add_todo" are
// resolved by the calling UI (redirect to form → on submit → resetStrikes).
// "increase_difficulty" is resolved here directly.

export async function applyPunishment(
  choice: PunishmentChoice,
  /** Required when choice === "increase_difficulty" */
  targetHabit?: Habit
): Promise<"resolved" | "redirect_habit" | "redirect_todo"> {
  switch (choice) {
    case "increase_difficulty": {
      if (!targetHabit || !targetHabit.metric) {
        throw new Error("A metric/limiter habit with a target value is required for this punishment.");
      }

      const currentTarget = targetHabit.metric.targetValue;
      const increase = Math.max(1, Math.round(currentTarget / 3)); // +33%, minimum +1
      const newTarget = currentTarget + increase;

      await updateHabit(targetHabit.id, {
        metric: {
          ...targetHabit.metric,
          targetValue: newTarget,
        },
      });

      await resetStrikes();
      return "resolved";
    }

    case "add_habit":
      // Caller must redirect to HabitForm. On successful creation → call resetStrikes().
      return "redirect_habit";

    case "add_todo":
      // Caller must redirect to TodoForm. On successful creation → call resetStrikes().
      return "redirect_todo";

    default:
      throw new Error(`Unknown punishment choice: ${choice}`);
  }
}
