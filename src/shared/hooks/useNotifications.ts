import { useEffect, useRef } from "react";
import { useAuthContext } from "../../features/auth/context";
import { getUserDoc } from "../../features/auth/services/userService";
import { sendNotification } from "../services/notificationService";
import { getToday } from "../utils/dateUtils";
import { isHabitScheduledToday, isHabitResting } from "../../features/habits/utils/scheduleEngine";
import { getHabits } from "../../features/habits/services/habitService";
import { getTodayLog } from "../../features/habits/services/logService";

export function useNotifications() {
  const { user } = useAuthContext();
  const lastNudgeDate = useRef<string | null>(null);
  const lastSummaryDate = useRef<string | null>(null);

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
      const today = getToday(undefined, settings.dailyResetTime);

      // 1. Evening Nudge
      // Trigger 2 hours before configured Bedtime (circadian sleep schedule)
      if (settings.eveningNudge && lastNudgeDate.current !== today) {
        const [bedH, bedM] = (settings.bedTime || "23:00").split(":").map(Number);
        
        let targetH = (bedH ?? 23) - 2;
        if (targetH < 0) targetH += 24;
        const targetM = bedM ?? 0;

        if (currentHour === targetH && currentMinute === targetM) {
          try {
            const [habits, todayLog] = await Promise.all([
              getHabits(),
              getTodayLog(settings.dailyResetTime)
            ]);

            const weeklyResetDay = settings.weeklyResetDay ?? 1;
            const incompleteHabits = habits.filter(h => {
              if (h.type === 'limiter') return false; // Limiters are caps, not actionable checklist items
              if (isHabitResting(h, settings.dailyResetTime)) return false;
              if (!isHabitScheduledToday(h, today, weeklyResetDay)) return false;

              const entry = todayLog?.habits?.[h.id];
              const isDoneToday = 
                !!entry?.completed || 
                (entry?.completions?.length ?? 0) > 0 || 
                (entry?.value ?? 0) > 0;

              return !isDoneToday;
            });

            // Only notify if incomplete scheduled habits remain
            if (incompleteHabits.length > 0) {
              const countText = incompleteHabits.length === 1 
                ? "1 remaining habit" 
                : `${incompleteHabits.length} remaining habits`;
              sendNotification(
                "🌙 Evening Nudge",
                `Don't forget to complete your ${countText} before bed!`
              );
            }
          } catch (err) {
            console.error("Failed to evaluate evening nudge habits:", err);
          } finally {
            lastNudgeDate.current = today;
          }
        }
      }

      // 2. Weekly Summary
      // Triggers briefly after the weekly reset day begins, e.g., 9:00 AM on the reset day
      if (settings.weeklySummary && lastSummaryDate.current !== today) {
        const todayDay = now.getDay(); // 0 is Sunday
        
        // Trigger at 9:00 AM on the weeklyResetDay
        if (todayDay === settings.weeklyResetDay && currentHour === 9 && currentMinute === 0) {
          sendNotification(
            "📊 Weekly Summary",
            "Your weekly report is ready. Open the Analytics tab to review your performance!"
          );
          lastSummaryDate.current = today;
        }
      }

    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [user]);
}

