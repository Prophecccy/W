import { PunishmentChoice } from "../types";
import { resetStrikes } from "./strikeService";
import { updateHabit, getHabits } from "../../habits/services/habitService";

// ─── Apply Punishment ────────────────────────────────────────────
// All three paths now call resetStrikes() immediately so the
// lockout overlay dismisses and the user can interact with the app.

export async function applyPunishment(
  choice: PunishmentChoice,
  habitId?: string
): Promise<"resolved" | "redirect_habit" | "redirect_todo"> {
  switch (choice) {
    case "increase_difficulty": {
      const habits = await getHabits();
      const target = habitId
        ? habits.find((h) => h.id === habitId)
        : habits.find((h) => h.isActive && h.metric && h.metric.targetValue > 0);

      if (target && target.metric) {
        const currentTarget = target.metric.targetValue;
        let newTarget = currentTarget;
        if (target.type === "limiter") {
          // Difficulty increase for avoid/reduce means reducing the target limit
          const decrease = Math.max(1, Math.round(currentTarget / 3)); // -33%, minimum -1
          newTarget = Math.max(1, currentTarget - decrease);
        } else {
          // Difficulty increase for positive habits means raising the target
          const increase = Math.max(1, Math.round(currentTarget / 3)); // +33%, minimum +1
          newTarget = currentTarget + increase;
        }

        await updateHabit(target.id, {
          metric: {
            ...target.metric,
            targetValue: newTarget,
          },
        });
      }
      
      await resetStrikes();
      return "resolved";
    }

    case "add_habit":
      return "redirect_habit";

    case "add_todo":
      return "redirect_todo";

    default:
      throw new Error(`Unknown punishment choice: ${choice}`);
  }
}
