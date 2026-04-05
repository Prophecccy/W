import { useEffect, useRef } from "react";
import { useAuthContext } from "../../features/auth/context";
import { getUserDoc } from "../../features/auth/services/userService";
import { sendNotification } from "../services/notificationService";

export function useNotifications() {
  const { user } = useAuthContext();
  const hasTriggeredNudge = useRef(false);
  const hasTriggeredSummary = useRef(false);

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

    }, 60000); // Check every minute

    // Also check on mount if it's already exactly the minute (edge case), but interval is usually fine.

    return () => clearInterval(interval);
  }, [user]);
}
