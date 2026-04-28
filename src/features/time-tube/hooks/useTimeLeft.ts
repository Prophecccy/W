import { useState, useEffect, useRef, useCallback } from "react";

export interface TimeLeftState {
  percentage: number;       // 1.0 (just woke) → 0.0 (bedtime)
  hoursLeft: number;
  minutesLeft: number;
  totalAwakeMinutes: number;
  elapsedMinutes: number;
  phase: "morning" | "midday" | "afternoon" | "evening" | "final" | "sleeping";
  /** true when the current time falls outside the wake→bed window */
  isSleeping: boolean;
}

/**
 * Parse "HH:MM" into total minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Get the total awake minutes between wake and bed.
 * Handles both same-day (wake 07:00, bed 23:00) and
 * overnight / night-owl schedules (wake 10:00, bed 02:00).
 *
 * Edge case: if wake === bed, treat as a full 24-hour cycle.
 */
function getTotalAwakeMinutes(wakeMin: number, bedMin: number): number {
  if (wakeMin === bedMin) return 1440; // 24h cycle
  if (bedMin > wakeMin) {
    // Same-day: wake 07:00, bed 23:00
    return bedMin - wakeMin;
  }
  // Overnight / night-owl: wake 10:00, bed 02:00
  return (1440 - wakeMin) + bedMin;
}

/**
 * Determine if the current time falls within the "sleeping" window
 * (i.e., between bedTime and next wakeTime).
 *
 * Same-day schedule (wake 07:00, bed 23:00):
 *   sleeping = now < wake OR now >= bed
 *
 * Overnight schedule (wake 10:00, bed 02:00):
 *   awake window wraps midnight, so sleeping = now >= bed AND now < wake
 */
function checkIsSleeping(nowMin: number, wakeMin: number, bedMin: number): boolean {
  if (wakeMin === bedMin) return false; // 24h cycle, never sleeping

  if (bedMin > wakeMin) {
    // Same-day schedule: awake = [wake, bed)
    return nowMin < wakeMin || nowMin >= bedMin;
  }
  // Overnight schedule: awake wraps midnight = [wake..1440) + [0..bed)
  // Sleeping = [bed..wake)
  return nowMin >= bedMin && nowMin < wakeMin;
}

/**
 * How many minutes have elapsed since wakeUpTime,
 * accounting for overnight / night-owl schedules.
 */
function getElapsedMinutes(nowMin: number, wakeMin: number, totalAwake: number): number {
  let elapsed: number;
  if (nowMin >= wakeMin) {
    elapsed = nowMin - wakeMin;
  } else {
    // Past midnight in an overnight schedule
    elapsed = (1440 - wakeMin) + nowMin;
  }
  // Clamp to [0, totalAwake]
  return Math.max(0, Math.min(elapsed, totalAwake));
}

function getPhase(percentage: number, isSleeping: boolean): TimeLeftState["phase"] {
  if (isSleeping) return "sleeping";
  if (percentage > 0.75) return "morning";
  if (percentage > 0.50) return "midday";
  if (percentage > 0.25) return "afternoon";
  if (percentage > 0.0833) return "evening"; // > ~5 min relative
  return "final";
}

interface UseTimeLeftOptions {
  wakeUpTime: string;  // "HH:MM"
  bedTime: string;     // "HH:MM"
  /** If true, uses setInterval(60s) instead of RAF for lower CPU usage */
  lowFrequency?: boolean;
}

export function useTimeLeft({ wakeUpTime, bedTime, lowFrequency = false }: UseTimeLeftOptions): TimeLeftState {
  const compute = useCallback((): TimeLeftState => {
    const wakeMin = parseTimeToMinutes(wakeUpTime);
    const bedMin = parseTimeToMinutes(bedTime);
    const totalAwake = getTotalAwakeMinutes(wakeMin, bedMin);

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    const sleeping = checkIsSleeping(nowMin, wakeMin, bedMin);

    if (sleeping) {
      return {
        percentage: 0,
        hoursLeft: 0,
        minutesLeft: 0,
        totalAwakeMinutes: totalAwake,
        elapsedMinutes: totalAwake,
        phase: "sleeping",
        isSleeping: true,
      };
    }

    const elapsed = getElapsedMinutes(nowMin, wakeMin, totalAwake);
    const remaining = totalAwake - elapsed;
    const pct = totalAwake > 0 ? remaining / totalAwake : 0;

    return {
      percentage: Math.max(0, Math.min(1, pct)),
      hoursLeft: Math.floor(remaining / 60),
      minutesLeft: Math.floor(remaining % 60),
      totalAwakeMinutes: totalAwake,
      elapsedMinutes: elapsed,
      phase: getPhase(Math.max(0, Math.min(1, pct)), false),
      isSleeping: false,
    };
  }, [wakeUpTime, bedTime]);

  const [state, setState] = useState<TimeLeftState>(compute);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (lowFrequency) {
      // Widget mode: update once per minute
      setState(compute());
      const id = setInterval(() => setState(compute()), 60_000);
      return () => clearInterval(id);
    }

    // Desktop mode: RAF for smooth drain
    let running = true;
    const tick = () => {
      if (!running) return;
      if (!document.hidden) {
        setState(compute());
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [compute, lowFrequency]);

  return state;
}
