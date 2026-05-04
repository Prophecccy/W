import { PunishmentChoice } from "../types";
import { resetStrikes } from "./strikeService";
import { updateHabit, getHabits } from "../../habits/services/habitService";

// ─── Apply Punishment ────────────────────────────────────────────
// All three paths now call resetStrikes() immediately so the
// lockout overlay dismisses and the user can interact with the app.

export async function applyPunishment(
  choice: PunishmentChoice
): Promise<"resolved" | "redirect_habit" | "redirect_todo"> {
  switch (choice) {
    case "increase_difficulty": {
      // Auto-select the first habit with a metric target
      const habits = await getHabits();
      const target = habits.find(
        (h) => h.isActive && h.metric && h.metric.targetValue > 0
      );

      if (target && target.metric) {
        const currentTarget = target.metric.targetValue;
        const increase = Math.max(1, Math.round(currentTarget / 3)); // +33%, minimum +1
        const newTarget = currentTarget + increase;

        await updateHabit(target.id, {
          metric: {
            ...target.metric,
            targetValue: newTarget,
          },
        });
      }
      // If no metric habit exists, punishment is waived — still reset strikes
      await resetStrikes();
      return "resolved";
    }

    case "add_habit":
      // Reset strikes immediately so the lockout overlay dismisses
      // and the user can reach the habit creation form.
      await resetStrikes();
      return "redirect_habit";

    case "add_todo":
      // Same — unlock first, then redirect.
      await resetStrikes();
      return "redirect_todo";

    default:
      throw new Error(`Unknown punishment choice: ${choice}`);
  }
}
