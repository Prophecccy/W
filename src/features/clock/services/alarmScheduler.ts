import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getAlarms, saveAlarms } from './alarmService';
import { Alarm } from '../types';

let lastTriggeredMinute = -1;
let lastTriggeredTimestampMs = 0; // Prevent spamming within the same second

/**
 * Validates if an alarm should trigger right now based on its config.
 */
function shouldTriggerAlarm(alarm: Alarm, now: Date): boolean {
  if (!alarm.enabled) return false;

  // 1. Check if it has a snooze override
  if (alarm.nextTriggerTimeMs) {
    // If we passed the snooze target, trigger it
    return now.getTime() >= alarm.nextTriggerTimeMs;
  }

  // 2. Standard time check
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentHHMM = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  
  if (alarm.time !== currentHHMM) return false;

  // 3. Day of week check
  const currentDay = now.getDay();
  // If daysOfWeek has entries, it must match today. If empty, it's a one-off.
  if (alarm.daysOfWeek.length > 0 && !alarm.daysOfWeek.includes(currentDay)) {
    return false;
  }

  // 4. Ensure we don't trigger the same natural alarm multiple times in the same minute
  if (lastTriggeredMinute === minutes) return false;

  return true;
}

async function checkAlarms() {
  const now = new Date();
  
  // Prevent double execution in the same 2 seconds
  if (now.getTime() - lastTriggeredTimestampMs < 2000) return;

  const alarms = await getAlarms();
  let triggeredAlarm: Alarm | null = null;
  let didUpdateAlarms = false;

  for (const alarm of alarms) {
    if (shouldTriggerAlarm(alarm, now)) {
      triggeredAlarm = alarm;
      
      // If it's a one-off (no days specified and no repeat override), disable it after triggering
      if (alarm.daysOfWeek.length === 0 && !alarm.repeatDaily && !alarm.nextTriggerTimeMs) {
         alarm.enabled = false;
      }
      
      // Clear snooze target since we are triggering it now
      alarm.nextTriggerTimeMs = null;
      didUpdateAlarms = true;
      break; // Only trigger one alarm at a time for safety
    }
  }

  if (triggeredAlarm) {
    lastTriggeredMinute = now.getMinutes();
    lastTriggeredTimestampMs = now.getTime();

    
    // Spawn the alarm popup
    spawnAlarmPopup(triggeredAlarm);

    if (didUpdateAlarms) {
      await saveAlarms(alarms);
    }
  }
}

async function spawnAlarmPopup(alarm: Alarm) {
  try {
    const existingWindow = await WebviewWindow.getByLabel('alarm-popup');
    if (existingWindow) {
      // If already open, we might want to just close it and reopen, or skip
      await existingWindow.close();
    }

    // Pass the alarm ID in the query string so the popup knows what to display/snooze
    const win = new WebviewWindow('alarm-popup', {
      url: `/alarm-popup?id=${alarm.id}`,
      title: 'Alarm',
      width: 600,
      height: 400,
      center: true,
      alwaysOnTop: true,
      decorations: false,
      visible: true,      // We want it strictly visible upon creation
      skipTaskbar: true
    });

    win.once('tauri://created', function () {
      // Alarm popup spawned successfully
    });

    win.once('tauri://error', function (e) {
      console.error('Alarm popup error:', e);
    });

  } catch (err) {
    console.error("Failed to spawn alarm popup:", err);
  }
}

export function initAlarmScheduler() {

  
  // Listen to the Rust heartbeat
  listen("background-tick", () => {
    checkAlarms();
  });
}
