// ─────────────────────────────────────────────────────────────────
// Predictive Strike Risk Engine — Heuristic Math Core
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

// ─── Public API ───────────────────────────────────────────────────

/**
 * Calculate the strike-risk score for a single uncompleted habit.
 *
 * @param habit           The habit object
 * @param historicalLogs  Array of HabitLog documents (last 30 days)
 * @param dailyResetTime  User's daily reset time, e.g. "04:00"
 * @param uncompletedToday  Number of remaining uncompleted tasks today
 * @param now             Current time (injectable for testing)
 */
export function calculateRisk(
  habit: Habit,
  historicalLogs: HabitLog[],
  dailyResetTime: string,
  uncompletedToday: number,
  now: Date = new Date()
): RiskResult {
  const timePressure = calcTimePressure(dailyResetTime, now);
  const variance = calcVariance(habit.id, historicalLogs, dailyResetTime, now);
  const loadFactor = calcLoadFactor(habit.id, historicalLogs, uncompletedToday);

  const raw = W_TIME * timePressure + W_VARIANCE * variance + W_LOAD * loadFactor;
  const score = Math.round(Math.max(0, Math.min(100, raw)));

  return {
    habitId: habit.id,
    score,
    timePressure: Math.round(timePressure),
    variance: Math.round(variance),
    loadFactor: Math.round(loadFactor),
  };
}

// ─── T: Time Pressure ─────────────────────────────────────────────
// Exponential curve: T = (elapsed / totalWindow)^k × 100
// Where elapsed = time since wake-up, totalWindow = wake → reset

function calcTimePressure(dailyResetTime: string, now: Date): number {
  const [resetH, resetM] = dailyResetTime.split(":").map(Number);

  // Build today's reset deadline as a Date
  const resetToday = new Date(now);
  resetToday.setHours(resetH, resetM, 0, 0);

  // If reset is in the early AM (e.g. 04:00), the effective deadline
  // for "today" is actually tomorrow at that time
  if (resetToday.getTime() <= now.getTime() - 12 * 3600 * 1000) {
    // reset is behind us by >12h → it's actually tomorrow's reset
    resetToday.setDate(resetToday.getDate() + 1);
  }

  // Total window = 24h (full cycle). We measure fraction used.
  const msUntilReset = resetToday.getTime() - now.getTime();
  const totalWindow = 24 * 3600 * 1000; // 24 hours in ms

  // Fraction of the day elapsed (1.0 = reset imminent, 0.0 = just started)
  const elapsed = Math.max(0, 1 - msUntilReset / totalWindow);

  // Exponential ramp — low early, spikes near the end
  return Math.pow(elapsed, EXPONENTIAL_STEEPNESS) * 100;
}

// ─── V: Variance Signal ──────────────────────────────────────────
// 1. Compute the Mean Time of Completion (MTC) in minutes-from-midnight
// 2. Compute Standard Deviation (σ) of completion times
// 3. If now > MTC + 1σ → spike proportionally

function calcVariance(
  habitId: string,
  logs: HabitLog[],
  _dailyResetTime: string,
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
      completionMinutes.push(d.getHours() * 60 + d.getMinutes());
    }
  }

  // Not enough data → return 0 (no signal)
  if (completionMinutes.length < MIN_DATA_POINTS) return 0;

  // Mean Time of Completion (minutes from midnight)
  const mtc = completionMinutes.reduce((a, b) => a + b, 0) / completionMinutes.length;

  // Standard Deviation
  const squaredDiffs = completionMinutes.map((m) => Math.pow(m - mtc, 2));
  const sigma = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / completionMinutes.length);

  // Current time in minutes from midnight
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

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
    for (const entry of Object.values(log.habits)) {
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
