import { BaseDirectory, readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { Timer } from '../types';

const TIMERS_DIR = 'alarms'; // Reuse same dir for simplicity or use 'timers'
const TIMERS_FILE = 'alarms/timers.json';

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
}

export async function ensureAppDataDir() {
  if (!isTauri()) return;
  try {
    const dirExists = await exists(TIMERS_DIR, { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      await mkdir(TIMERS_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    }
  } catch (err) {
    console.warn("Could not ensure AppData dir:", err);
  }
}

export async function getTimers(): Promise<Timer[]> {
  if (!isTauri()) {
    try {
      const stored = localStorage.getItem('w-timers');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }
  try {
    await ensureAppDataDir();
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
  const now = Date.now();
  const updated = timers.map(t => {
    if (t.status === 'running' && t.endTimeMs) {
      const remaining = Math.max(0, Math.ceil((t.endTimeMs - now) / 1000));
      return { ...t, remainingSeconds: remaining };
    }
    return t;
  });

  if (!isTauri()) {
    try {
      localStorage.setItem('w-timers', JSON.stringify(updated));
    } catch {}
    return;
  }

  try {
    await ensureAppDataDir();
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
