export interface Alarm {
  id: string;
  time: string; // HH:mm format (24h or 12h, let's keep 24h internal "HH:mm")
  label: string;
  audioPath: string | null;
  daysOfWeek: number[]; // 0-6 (0 = Sunday, 1 = Monday, etc.)
  repeatDaily: boolean; // if false, it deletes itself or disables after firing
  snoozeCount: number; // max allowed snoozes
  snoozeGapMinutes: number; // minutes per snooze
  wakeUpMessage: string;
  enabled: boolean;
  
  // State elements
  currentSnoozes: number; // Tracks how many times it was snoozed this session
  nextTriggerTimeMs: number | null; // Used to override when snoozed
}

export interface Timer {
  id: string;
  name: string;
  durationSeconds: number;
  remainingSeconds: number;
  status: 'stopped' | 'running' | 'paused';
  endTimeMs: number | null;
  audioPath: string | null;
}

export interface StopwatchLap {
  id: string;
  lapNumber: number;
  lapTimeMs: number;
  totalTimeMs: number;
}

export interface StopwatchState {
  running: boolean;
  startTimeMs: number | null;
  accumulatedMs: number;
  elapsedMs: number;
  laps: StopwatchLap[];
}
