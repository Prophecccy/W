import { useState, useEffect } from 'react';

export interface TimeLeftResult {
  percent: number;      // Waking Fuel (100% -> 0%)
  progress: number;     // Day Progress (0% -> 100%)
  minutesPassed: number;
  totalMinutes: number;
  phase: 'awake' | 'day-ended' | 'sleeping';
}

export function useTimeLeft(
  wakeUpTime: string = "07:00", 
  bedTime: string = "23:00"
): TimeLeftResult {
  const [data, setData] = useState<TimeLeftResult>({
    percent: 100,
    progress: 0,
    minutesPassed: 0,
    totalMinutes: 960,
    phase: 'awake'
  });

  useEffect(() => {
    const calculate = () => {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const [wakeH, wakeM] = wakeUpTime.split(':').map(Number);
      const wakeMinutes = wakeH * 60 + wakeM;

      const [bedH, bedM] = bedTime.split(':').map(Number);
      let bedMinutes = bedH * 60 + bedM;

      // Night-Owl Logic: if bedTime is earlier than wakeUpTime, it means it's the next day
      if (bedMinutes <= wakeMinutes) {
        bedMinutes += 24 * 60;
      }

      const totalAwakeMinutes = bedMinutes - wakeMinutes;
      
      // Calculate current position relative to the wake window
      let adjustedNow = currentMinutes;
      
      // If we are currently before the wake time BUT the window ends after midnight,
      // and we are currently in that "after midnight" portion
      if (currentMinutes < wakeMinutes && bedMinutes > 1440 && currentMinutes < (bedMinutes - 1440)) {
        adjustedNow += 24 * 60;
      }

      const elapsed = adjustedNow - wakeMinutes;

      let currentPhase: 'awake' | 'day-ended' | 'sleeping' = 'awake';
      
      if (elapsed < 0) {
        currentPhase = 'sleeping';
      } else if (elapsed >= totalAwakeMinutes) {
        currentPhase = 'day-ended';
      }

      // Progress: 0 to 100
      const progress = Math.min(100, Math.max(0, (elapsed / totalAwakeMinutes) * 100));
      
      // Fuel: 100 to 0 (Drainage)
      const percent = 100 - progress;

      setData({
        percent,
        progress,
        minutesPassed: elapsed,
        totalMinutes: totalAwakeMinutes,
        phase: currentPhase
      });
    };

    calculate();
    const interval = setInterval(calculate, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [wakeUpTime, bedTime]);

  return data;
}
