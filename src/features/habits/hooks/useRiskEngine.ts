// ─────────────────────────────────────────────────────────────────
// useRiskEngine — Polling hook for Predictive Strike Risk
//
// Runs every 5 minutes, iterates over all active uncompleted habits,
// calculates risk scores via heuristicEngine, and fires native
// OS notifications when a habit crosses the 85% threshold.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { Habit, HabitLog } from "../types";
import { calculateRisk, RiskResult } from "../utils/heuristicEngine";
import { getLogRange } from "../services/logService";
import { isHabitScheduledToday } from "../utils/scheduleEngine";
import { getToday, subtractDays } from "../../../shared/utils/dateUtils";
import { sendNotification } from "../../../shared/services/notificationService";
import { useUserStore } from "../../../shared/stores/userStore";
import { getRandomNudge } from "../utils/riskDialogue";

// ─── Constants ────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const NOTIFICATION_THRESHOLD = 85;       // fire native nudge at 85%
const LOOKBACK_DAYS = 30;               // historical window

export interface RiskScoreMap {
  [habitId: string]: number; // habitId → 0–100 score
}

// ─── Persistence Helpers ──────────────────────────────────────────
const getWarningKey = () => `w_risk_warnings_${getToday()}`;

const hasWarned = (habitId: string) => {
  const key = getWarningKey();
  const warnedIds = JSON.parse(localStorage.getItem(key) || "[]");
  return warnedIds.includes(habitId);
};

const markWarned = (habitId: string) => {
  const key = getWarningKey();
  const warnedIds = JSON.parse(localStorage.getItem(key) || "[]");
  if (!warnedIds.includes(habitId)) {
    warnedIds.push(habitId);
    localStorage.setItem(key, JSON.stringify(warnedIds));
  }
};

/**
 * Polls every 5 minutes, calculates risk scores for all uncompleted
 * habits scheduled today, and fires native notifications at threshold.
 *
 * @param habits    Full habit list (from HabitsPage state)
 * @param todayLog  Current day's log (from HabitsPage state)
 * @returns riskScores — Record<habitId, number> updated every cycle
 */
export function useRiskEngine(
  habits: Habit[],
  todayLog: HabitLog | null
): RiskScoreMap {
  const { userDoc } = useUserStore();
  const [riskScores, setRiskScores] = useState<RiskScoreMap>({});
  const historicalLogsRef = useRef<HabitLog[]>([]);
  const lastQueryTimeRef = useRef<number>(0);

  // ─── Core calculation cycle ─────────────────────────────────────
  const runCycle = useCallback(async () => {
    if (!userDoc || habits.length === 0) return;

    const today = getToday();
    const resetTime = userDoc.settings.dailyResetTime || "04:00";
    const weeklyResetDay = userDoc.settings.weeklyResetDay ?? 1;

    // 1. Filter to uncompleted, scheduled, active habits (exclude limiters)
    const uncompleted = habits.filter((h) => {
      if (!h.isActive) return false;
      if (h.type === "limiter") return false;
      if (!isHabitScheduledToday(h, today, weeklyResetDay)) return false;
      const logEntry = todayLog?.habits?.[h.id];
      return !logEntry?.completed;
    });

    if (uncompleted.length === 0) {
      setRiskScores({});
      return;
    }

    // 2. Fetch historical logs (throttled duplicate reads: only allow a database read once every 15 seconds)
    const nowTime = Date.now();
    const needsFetch = nowTime - lastQueryTimeRef.current >= 15000 || historicalLogsRef.current.length === 0;
    
    let historicalLogs = historicalLogsRef.current;
    if (needsFetch) {
      try {
        lastQueryTimeRef.current = nowTime;
        const startDate = subtractDays(today, LOOKBACK_DAYS);
        historicalLogs = await getLogRange(startDate, today);
        historicalLogsRef.current = historicalLogs;
      } catch (err) {
        console.warn("[RiskEngine] Failed to fetch historical logs:", err);
      }
    }

    // 3. Calculate scores
    const now = new Date();
    const newScores: RiskScoreMap = {};

    for (const habit of uncompleted) {
      const result: RiskResult = calculateRisk(
        habit,
        historicalLogs,
        resetTime,
        uncompleted.length,
        now
      );

      newScores[habit.id] = result.score;

      // 4. Fire notification if threshold crossed and not yet warned
      if (
        result.score >= NOTIFICATION_THRESHOLD &&
        !hasWarned(habit.id)
      ) {
        markWarned(habit.id);

        // Evaluate scenario
        const [rh, rm] = resetTime.split(":").map(Number);
        const resetDate = new Date(now);
        resetDate.setHours(rh, rm, 0, 0);
        if (now > resetDate) resetDate.setDate(resetDate.getDate() + 1);
        const hoursToReset = (resetDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        const isLate = hoursToReset <= 3;
        const isHighLoad = uncompleted.length > 4;

        let scenario: "lateTime" | "highLoad" | "generalRisk" = "generalRisk";
        if (isLate) scenario = "lateTime";
        else if (isHighLoad) scenario = "highLoad";

        const nudge = getRandomNudge(scenario, habit.title);

        if (userDoc.settings.notifications && userDoc.settings.predictiveWarnings !== false) {
          sendNotification("[ W: STRIKE RISK ]", nudge).catch(() => {}); // non-critical
        }
      }
    }

    setRiskScores(newScores);
  }, [habits, todayLog, userDoc]);

  // ─── Polling interval ───────────────────────────────────────────
  useEffect(() => {
    // Run immediately on mount / dependency change
    runCycle();

    const interval = setInterval(runCycle, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runCycle]);

  return riskScores;
}
