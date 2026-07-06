// ─── Predictive Strike Risk Engine ─── Heuristic Math Core
//
// Calculates a 0–100 risk score for a single habit based on:
//   T (Time Pressure)   — exponential ramp toward reset deadline
//   V (Variance Signal) — spike when user is past MTC + 1σ
//   L (Load Factor)     — penalty when today's remaining load > average
//
// WEIGHTS (tunable):
//   wT = 0.50  (time pressure dominates as day ends)
//   wV = 0.30  (historical deviation is the 2nd strongest signal)
//   wL = 0.20  (daily overload is a lighter modifier)
// ─────────────────────────────────────────────────────────────────

import type { Habit, HabitLog, CompletionEntry } from "../types";
import { getMsUntilReset } from "../../../shared/utils/dateUtils";
import { isHabitScheduledToday } from "./scheduleEngine";

/** Final risk result for a single habit */
export interface RiskResult {
  habitId: string;
  score: number;       // 0–100 clamped
  timePressure: number; // 0–100 raw
  variance: number;     // 0–100 raw
  loadFactor: number;   // 0–100 raw
}

// ─── Constants ────────────────────────────────────────────────────
const W_TIME = 0.50;
const W_VARIANCE = 0.30;
const W_LOAD = 0.20;

const MIN_DATA_POINTS = 3;      // need at least 3 completions for stats
const EXPONENTIAL_STEEPNESS = 4; // controls how sharply time pressure ramps
const EARLY_WARNING_WINDOW_HOURS = 6;
const EARLY_SUPPRESSION_CAP = 70;
const OVERWHELMING_FAIL_RATE = 0.9;
const OVERWHELMING_MIN_AT_RISK_DAYS = 7;

// ─── Helper for Reset Boundary ───────────────────────────────────
function getMinutesSinceReset(d: Date, resetTime: string): number {
  const [rh, rm] = resetTime.split(":").map(Number);
  const resetMinutes = rh * 60 + rm;
  const timeMinutes = d.getHours() * 60 + d.getMinutes();
  
  let diff = timeMinutes - resetMinutes;
  if (diff < 0) {
    diff += 24 * 60;
  }
  return diff;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Calculate the strike-risk score for a single uncompleted habit.
 *
 * @param habit           The habit object
 * @param historicalLogs  Array of HabitLog documents (last 30 days)
 * @param dailyResetTime  User's daily reset time, e.g. "04:00"
 * @param uncompletedToday  Number of remaining uncompleted tasks today
 * @param weeklyResetDay  User's weekly reset day index (0-6)
 * @param now             Current time (injectable for testing)
 */
export function calculateRisk(
  habit: Habit,
  historicalLogs: HabitLog[],
  dailyResetTime: string,
  uncompletedToday: number,
  weeklyResetDay: number = 1,
  now: Date = new Date()
): RiskResult {
  const ageMs = now.getTime() - habit.createdAt;
  const historyCount = historicalLogs.filter((log) => log.habits && log.habits[habit.id]).length;

  if (ageMs < 3 * 24 * 3600 * 1000 || historyCount < MIN_DATA_POINTS) {
    return {
      habitId: habit.id,
      score: 0,
      timePressure: 0,
      variance: 0,
      loadFactor: 0,
    };
  }

  const msUntilReset = getMsUntilReset(dailyResetTime, now);
  const hoursToReset = msUntilReset / (1000 * 60 * 60);

  const timePressure = calcTimePressure(dailyResetTime, now);
  const variance = calcVariance(habit.id, historicalLogs, dailyResetTime, now);
  const loadFactor = calcLoadFactor(habit.id, historicalLogs, uncompletedToday);

  const raw = W_TIME * timePressure + W_VARIANCE * variance + W_LOAD * loadFactor;
  const shouldSuppressEarly =
    hoursToReset > EARLY_WARNING_WINDOW_HOURS &&
    !hasOverwhelmingEarlyFailureEvidence(habit, historicalLogs, dailyResetTime, weeklyResetDay, now);

  const earlyAdjusted = shouldSuppressEarly ? Math.min(raw, EARLY_SUPPRESSION_CAP) : raw;
  const score = Math.round(Math.max(0, Math.min(100, earlyAdjusted)));

  return {
    habitId: habit.id,
    score,
    timePressure: Math.round(Math.max(0, Math.min(100, timePressure))),
    variance: Math.round(Math.max(0, Math.min(100, variance))),
    loadFactor: Math.round(Math.max(0, Math.min(100, loadFactor))),
  };
}

// ─── T: Time Pressure ─────────────────────────────────────────────
// Exponential curve: T = (elapsed / totalWindow)^k × 100
// Where elapsed = time since wake-up, totalWindow = wake → reset

function calcTimePressure(dailyResetTime: string, now: Date): number {
  const msUntilReset = getMsUntilReset(dailyResetTime, now);
  const totalWindow = 24 * 3600 * 1000; // 24 hours in ms

  // Fraction of the day elapsed (1.0 = reset imminent, 0.0 = just started)
  const elapsed = Math.max(0, Math.min(1, 1 - msUntilReset / totalWindow));

  // Exponential ramp — low early, spikes near the end
  return Math.pow(elapsed, EXPONENTIAL_STEEPNESS) * 100;
}

function hasOverwhelmingEarlyFailureEvidence(
  habit: Habit,
  logs: HabitLog[],
  dailyResetTime: string,
  weeklyResetDay: number,
  now: Date
): boolean {
  const nowMinutes = getMinutesSinceReset(now, dailyResetTime);
  let missed = 0;
  let atRisk = 0;

  for (const log of logs) {
    if (!isHabitScheduledToday(habit, log.date, weeklyResetDay)) continue;

    const entry = log.habits[habit.id];
    if (!entry || !entry.completed) {
      missed++;
      atRisk++;
      continue;
    }

    if (!entry.completions?.length) continue;

    const earliest = entry.completions.reduce<CompletionEntry | null>(
      (min, c) => (!min || c.timestamp < min.timestamp ? c : min),
      null
    );

    if (!earliest) continue;

    const d = new Date(earliest.timestamp);
    const completionMinutes = getMinutesSinceReset(d, dailyResetTime);

    if (completionMinutes > nowMinutes) atRisk++;
  }

  if (atRisk < OVERWHELMING_MIN_AT_RISK_DAYS) return false;
  return missed / atRisk >= OVERWHELMING_FAIL_RATE;
}

// ─── V: Variance Signal ──────────────────────────────────────────
// 1. Compute the Mean Time of Completion (MTC) in minutes-from-reset
// 2. Compute Standard Deviation (σ) of completion times
// 3. If now > MTC + 1σ → spike proportionally

function calcVariance(
  habitId: string,
  logs: HabitLog[],
  dailyResetTime: string,
  now: Date
): number {
  // Extract completion timestamps for this habit from historical logs
  const completionMinutes: number[] = [];

  for (const log of logs) {
    const entry = log.habits[habitId];
    if (!entry || !entry.completed || !entry.completions?.length) continue;

    // Use the earliest completion of the day (when they actually did it)
    const earliest = entry.completions.reduce<CompletionEntry | null>(
      (min, c) => (!min || c.timestamp < min.timestamp ? c : min),
      null
    );

    if (earliest) {
      const d = new Date(earliest.timestamp);
      completionMinutes.push(getMinutesSinceReset(d, dailyResetTime));
    }
  }

  // Not enough data → return 0 (no signal)
  if (completionMinutes.length < MIN_DATA_POINTS) return 0;

  // Mean Time of Completion (minutes from reset)
  const mtc = completionMinutes.reduce((a, b) => a + b, 0) / completionMinutes.length;

  // Standard Deviation
  const squaredDiffs = completionMinutes.map((m) => Math.pow(m - mtc, 2));
  const sigma = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / completionMinutes.length);

  // Current time in minutes from reset
  const nowMinutes = getMinutesSinceReset(now, dailyResetTime);

  // If we're past MTC + 1σ, risk increases proportionally
  const threshold = mtc + sigma;
  if (nowMinutes <= threshold) return 0;

  // How far past the threshold? Scale to 100 over 2σ beyond the threshold
  const overshoot = nowMinutes - threshold;
  const scale = Math.max(sigma, 30); // minimum 30-min scale to avoid division issues
  const normalized = Math.min(1, overshoot / (2 * scale));

  return normalized * 100;
}

// ─── L: Load Factor ──────────────────────────────────────────────
// Compare today's uncompleted task count vs the user's historical
// average daily completion count. More remaining = higher risk.

function calcLoadFactor(
  _habitId: string,
  logs: HabitLog[],
  uncompletedToday: number
): number {
  // Calculate average daily completion count from historical logs
  const dailyCounts: number[] = [];

  for (const log of logs) {
    let count = 0;
    for (const entry of Object.values(log.habits || {})) {
      if (entry.completed) count++;
    }
    dailyCounts.push(count);
  }

  if (dailyCounts.length === 0) return 0;

  const avgDaily = dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length;

  // If remaining > average, penalize proportionally
  if (avgDaily <= 0) return uncompletedToday > 0 ? 50 : 0;

  const ratio = uncompletedToday / avgDaily;

  // ratio 1.0 = average → 30/100
  // ratio 2.0 = double average → 80/100
  // ratio 0.5 = light day → 10/100
  const scaled = Math.min(100, ratio * 50);

  return scaled;
}
