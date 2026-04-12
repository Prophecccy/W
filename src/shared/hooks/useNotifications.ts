import { useEffect, useRef } from "react";
import { useAuthContext } from "../../features/auth/context";
import { getUserDoc } from "../../features/auth/services/userService";
import { sendNotification } from "../services/notificationService";
import { getMessagesForPhase, pickMessage } from "../../features/time-tube/data/timeNudgeMessages";
import { getHabits } from "../../features/habits/services/habitService";
import { getTodos } from "../../features/todos/services/todoService";
import { getTodayLog } from "../../features/habits/services/logService";
import { isHabitScheduledToday } from "../../features/habits/utils/scheduleEngine";
import { getToday } from "../utils/dateUtils";

export function useNotifications() {
  const { user } = useAuthContext();
  const hasTriggeredNudge = useRef(false);
  const hasTriggeredSummary = useRef(false);

  // Time-left nudge state
  const timeNudgeSent = useRef<Set<string>>(new Set()); // track which checkpoints fired
  const recentMsgIndices = useRef<number[]>([]);

  useEffect(() => {
    if (!user) return;

    // Check once every minute
    const interval = setInterval(async () => {
      const doc = await getUserDoc(user.uid);
      if (!doc) return;

      const settings = doc.settings;
      if (!settings || !settings.notifications) return;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // 1. Evening Nudge
      // Calculate 2 hours before dailyResetTime
      if (settings.eveningNudge && !hasTriggeredNudge.current) {
        const [resetH, resetM] = settings.dailyResetTime.split(":").map(Number);
        
        let targetH = resetH - 2;
        if (targetH < 0) targetH += 24;

        if (currentHour === targetH && currentMinute === resetM) {
          sendNotification(
            "🌙 Evening Nudge",
            "Don't forget to complete your remaining habits before the day resets!"
          );
          hasTriggeredNudge.current = true;
          // Reset the trigger flag at the actual reset time (or just rely on reload)
        }
      }

      // 2. Weekly Summary
      // Triggers briefly after the weekly reset day begins, e.g., 9:00 AM on the reset day
      if (settings.weeklySummary && !hasTriggeredSummary.current) {
        const todayDay = now.getDay(); // 0 is Sunday
        
        // Let's trigger it at 9:00 AM on the weeklyResetDay
        if (todayDay === settings.weeklyResetDay && currentHour === 9 && currentMinute === 0) {
          // Since it might involve deep queries, just send a simple prompt to open the app
          sendNotification(
            "📊 Weekly Summary",
            "Your weekly report is ready. Open the Analytics tab to review your performance!"
          );
          hasTriggeredSummary.current = true;
        }
      }

      // 3. Time Left Nudges
      if ((settings as any).timeLeftNudges !== false) {
        const wakeUpTime = settings.wakeUpTime ?? "07:00";
        const bedTime = settings.bedTime ?? "23:00";

        const wakeMin = parseTime(wakeUpTime);
        const bedMin = parseTime(bedTime);
        const totalAwake = bedMin > wakeMin ? bedMin - wakeMin : (1440 - wakeMin) + bedMin;
        const nowMin = currentHour * 60 + currentMinute;

        let elapsed: number;
        if (nowMin >= wakeMin) {
          elapsed = nowMin - wakeMin;
        } else {
          elapsed = (1440 - wakeMin) + nowMin;
        }
        elapsed = Math.max(0, Math.min(elapsed, totalAwake));

        const remaining = totalAwake - elapsed;
        const pct = totalAwake > 0 ? remaining / totalAwake : 0;

        // Checkpoints: 50%, 25%, ~1hr, ~30min, ~15min
        const checkpoints: { key: string; condition: boolean; phase: "morning" | "midday" | "afternoon" | "evening" | "final" }[] = [
          { key: "50pct", condition: pct <= 0.50 && pct > 0.45, phase: "midday" },
          { key: "25pct", condition: pct <= 0.25 && pct > 0.20, phase: "afternoon" },
          { key: "1hr",   condition: remaining <= 60 && remaining > 55, phase: "evening" },
          { key: "30min", condition: remaining <= 30 && remaining > 25, phase: "final" },
          { key: "15min", condition: remaining <= 15 && remaining > 10, phase: "final" },
        ];

        for (const cp of checkpoints) {
          if (cp.condition && !timeNudgeSent.current.has(cp.key)) {
            timeNudgeSent.current.add(cp.key);

            // Get live task counts
            try {
              const today = getToday();
              const [habits, todos, log] = await Promise.all([
                getHabits(),
                getTodos(),
                getTodayLog(),
              ]);

              const scheduledHabits = habits.filter(h => {
                const isComplete = !!log?.habits[h.id]?.completed;
                if (isComplete) return false;
                return isHabitScheduledToday(h, today) && h.type !== "limiter";
              });

              const currentTodos = todos.filter(t => !t.future || t.future <= today);

              const messages = getMessagesForPhase(cp.phase);
              const { message, index } = pickMessage(messages, recentMsgIndices.current);

              // Track recent indices (keep last 3)
              recentMsgIndices.current.push(index);
              if (recentMsgIndices.current.length > 3) {
                recentMsgIndices.current.shift();
              }

              const body = message.body({
                hours: Math.floor(remaining / 60),
                minutes: Math.floor(remaining % 60),
                habitCount: scheduledHabits.length,
                todoCount: currentTodos.length,
              });

              sendNotification(message.title, body);
            } catch {
              // Non-critical — skip this nudge
            }
          }
        }
      }

    }, 60000); // Check every minute

    // Also check on mount if it's already exactly the minute (edge case), but interval is usually fine.

    return () => clearInterval(interval);
  }, [user]);
}

function parseTime(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
