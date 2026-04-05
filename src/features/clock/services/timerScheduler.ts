import { listen } from '@tauri-apps/api/event';
import { getTimers, updateTimer } from './timerService';
import { sendNotification } from '../../../shared/services/notificationService';
import { playAudio } from './audioService';

let schedulerUnlisten: (() => void) | null = null;
let recentlyFiredTimers = new Set<string>();

export async function initTimerScheduler() {
  if (schedulerUnlisten) return;

  schedulerUnlisten = await listen('background-tick', async () => {
    try {
      const timers = await getTimers();
      const now = Date.now();

      for (const timer of timers) {
        if (timer.status === 'running' && timer.endTimeMs) {
          if (now >= timer.endTimeMs) {
            // Timer finished
            if (!recentlyFiredTimers.has(timer.id)) {
              recentlyFiredTimers.add(timer.id);
              
              // Trigger notification
              sendNotification('Timer Finished', `${timer.name} has finished!`);
              
              // Play audio if set
              if (timer.audioPath) {
                // Just play once without loop
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
  });
}
