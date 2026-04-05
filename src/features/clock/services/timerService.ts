import { BaseDirectory, readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { Timer } from '../types';

const TIMERS_FILE = 'timers.json';

export async function getTimers(): Promise<Timer[]> {
  try {
    if (await exists(TIMERS_FILE, { baseDir: BaseDirectory.AppData })) {
      const contents = await readTextFile(TIMERS_FILE, { baseDir: BaseDirectory.AppData });
      return JSON.parse(contents);
    }
  } catch (e) {
    console.error('Failed to load timers:', e);
  }
  return [];
}

export async function saveTimers(timers: Timer[]): Promise<void> {
  try {
    // Make sure we update remainingSeconds gracefully if running
    const now = Date.now();
    const updated = timers.map(t => {
      if (t.status === 'running' && t.endTimeMs) {
        const remaining = Math.max(0, Math.ceil((t.endTimeMs - now) / 1000));
        return { ...t, remainingSeconds: remaining };
      }
      return t;
    });
    await writeTextFile(TIMERS_FILE, JSON.stringify(updated), { baseDir: BaseDirectory.AppData });
  } catch (e) {
    console.error('Failed to save timers:', e);
  }
}

export async function createTimer(timer: Timer): Promise<boolean> {
  const timers = await getTimers();
  if (timers.length >= 6) return false;
  timers.push(timer);
  await saveTimers(timers);
  return true;
}

export async function updateTimer(id: string, updates: Partial<Timer>): Promise<void> {
  const timers = await getTimers();
  const index = timers.findIndex(t => t.id === id);
  if (index !== -1) {
    timers[index] = { ...timers[index], ...updates };
    await saveTimers(timers);
  }
}

export async function deleteTimer(id: string): Promise<void> {
  let timers = await getTimers();
  timers = timers.filter(t => t.id !== id);
  await saveTimers(timers);
}

export async function startTimer(id: string): Promise<void> {
  const timers = await getTimers();
  const timer = timers.find(t => t.id === id);
  if (timer && timer.status !== 'running') {
    timer.status = 'running';
    timer.endTimeMs = Date.now() + timer.remainingSeconds * 1000;
    await saveTimers(timers);
  }
}

export async function pauseTimer(id: string): Promise<void> {
  const timers = await getTimers();
  const timer = timers.find(t => t.id === id);
  if (timer && timer.status === 'running') {
    timer.status = 'paused';
    if (timer.endTimeMs) {
      timer.remainingSeconds = Math.max(0, Math.ceil((timer.endTimeMs - Date.now()) / 1000));
      timer.endTimeMs = null;
    }
    await saveTimers(timers);
  }
}

export async function resumeTimer(id: string): Promise<void> {
  const timers = await getTimers();
  const timer = timers.find(t => t.id === id);
  if (timer && timer.status === 'paused') {
    timer.status = 'running';
    timer.endTimeMs = Date.now() + timer.remainingSeconds * 1000;
    await saveTimers(timers);
  }
}

export async function resetTimer(id: string): Promise<void> {
  const timers = await getTimers();
  const timer = timers.find(t => t.id === id);
  if (timer) {
    timer.status = 'stopped';
    timer.remainingSeconds = timer.durationSeconds;
    timer.endTimeMs = null;
    await saveTimers(timers);
  }
}
