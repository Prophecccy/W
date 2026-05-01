// ─────────────────────────────────────────────────────────────────
// useRiskEngine — Polling hook for Predictive Strike Risk
//
// Runs every 5 minutes, iterates over all active uncompleted habits,
// calculates risk scores via heuristicEngine, and fires native
// OS notifications when a habit crosses the 85% threshold.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { Habit, HabitLog } from "../types";
import { calculateRisk, RiskResult } from "../utils/heuristicEngine";
import { getLogRange } from "../services/logService";
import { isHabitScheduledToday } from "../utils/scheduleEngine";
import { getToday, subtractDays } from "../../../shared/utils/dateUtils";
import { sendNotification } from "../../../shared/services/notificationService";
import { useUserStore } from "../../../shared/stores/userStore";

// ─── Constants ────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const NOTIFICATION_THRESHOLD = 85;       // fire native nudge at 85%
const LOOKBACK_DAYS = 30;               // historical window

export interface RiskScoreMap {
  [habitId: string]: number; // habitId → 0–100 score
}

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

  // Track which habits have already fired a notification today
  const hasWarnedToday = useRef<Set<string>>(new Set());
  const todayRef = useRef<string>(getToday());

  // Reset warned set at day boundary
  useEffect(() => {
    const currentDay = getToday();
    if (currentDay !== todayRef.current) {
      hasWarnedToday.current.clear();
      todayRef.current = currentDay;
    }
  });

  // ─── Core calculation cycle ─────────────────────────────────────
  const runCycle = useCallback(async () => {
    if (!userDoc || habits.length === 0) return;

    const today = getToday();
    const resetTime = userDoc.settings.dailyResetTime || "04:00";

    // 1. Filter to uncompleted, scheduled, active habits (exclude limiters)
    const uncompleted = habits.filter((h) => {
      if (!h.isActive) return false;
      if (h.type === "limiter") return false;
      if (!isHabitScheduledToday(h, today)) return false;
      const logEntry = todayLog?.habits[h.id];
      return !logEntry?.completed;
    });

    if (uncompleted.length === 0) {
      setRiskScores({});
      return;
    }

    // 2. Fetch historical logs (cached per cycle — one Firestore read)
    let historicalLogs: HabitLog[] = [];
    try {
      const startDate = subtractDays(today, LOOKBACK_DAYS);
      historicalLogs = await getLogRange(startDate, today);
    } catch (err) {
      console.warn("[RiskEngine] Failed to fetch historical logs:", err);
      return;
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
        !hasWarnedToday.current.has(habit.id)
      ) {
        hasWarnedToday.current.add(habit.id);
        sendNotification(
          "⚠️ Statistical Anomaly",
          `High probability of Strike on "${habit.title}". Risk: ${result.score}%. Execute now.`
        ).catch(() => {}); // non-critical
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
