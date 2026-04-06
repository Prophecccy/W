import { listen } from '@tauri-apps/api/event';
import { getTimers, updateTimer } from './timerService';
import { sendNotification } from '../../../shared/services/notificationService';
import { playAudio } from './audioService';

let schedulerUnlisten: (() => void) | null = null;
let browserInterval: ReturnType<typeof setInterval> | null = null;
let recentlyFiredTimers = new Set<string>();

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
}

async function checkTimers() {
  try {
    const timers = await getTimers();
    const now = Date.now();

    for (const timer of timers) {
      if (timer.status === 'running' && timer.endTimeMs) {
        if (now >= timer.endTimeMs) {
          if (!recentlyFiredTimers.has(timer.id)) {
            recentlyFiredTimers.add(timer.id);

            // Trigger notification (will gracefully fail in browser)
            try {
              sendNotification('Timer Finished', `${timer.name} has finished!`);
            } catch {}

            // Play audio if set
            if (timer.audioPath) {
              playAudio(timer.audioPath, false);
            }

            // Update state to stopped
            await updateTimer(timer.id, {
              status: 'stopped',
              endTimeMs: null,
              remainingSeconds: timer.durationSeconds
            });

            // Allow it to fire again if restarted later
            setTimeout(() => recentlyFiredTimers.delete(timer.id), 2000);
          }
        }
      }
    }
  } catch (e) {
    console.error('Timer scheduler error:', e);
  }
}

export async function initTimerScheduler() {
  if (schedulerUnlisten || browserInterval) return;

  if (isTauri()) {
    // Native Tauri: use background-tick event
    schedulerUnlisten = await listen('background-tick', checkTimers);
  } else {
    // Browser fallback: poll every 500ms
    browserInterval = setInterval(checkTimers, 500);
  }
}
