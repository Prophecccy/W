import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { BaseDirectory } from '@tauri-apps/api/path';
import { Alarm } from '../types';

const ALARMS_FILE = 'alarms.json';
const MAX_ALARMS = 6;

export async function ensureAppDataDir() {
  // Try to create the config directory just in case it doesn't exist
  try {
    const dirExists = await exists('', { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
    }
  } catch (err) {
    console.warn("Could not ensure AppData dir:", err);
  }
}

export async function getAlarms(): Promise<Alarm[]> {
  try {
    await ensureAppDataDir();
    const fileExists = await exists(ALARMS_FILE, { baseDir: BaseDirectory.AppData });
    if (!fileExists) {
      return [];
    }
    const content = await readTextFile(ALARMS_FILE, { baseDir: BaseDirectory.AppData });
    return JSON.parse(content) as Alarm[];
  } catch (err) {
    console.error('Failed to read alarms from fs:', err);
    return [];
  }
}

export async function saveAlarms(alarms: Alarm[]): Promise<void> {
  try {
    await ensureAppDataDir();
    const content = JSON.stringify(alarms, null, 2);
    await writeTextFile(ALARMS_FILE, content, { baseDir: BaseDirectory.AppData });
  } catch (err) {
    console.error('Failed to write alarms to fs:', err);
  }
}

export async function createAlarm(alarm: Alarm): Promise<boolean> {
  const alarms = await getAlarms();
  if (alarms.length >= MAX_ALARMS) {
    return false; // Reached limit
  }
  alarms.push(alarm);
  await saveAlarms(alarms);
  return true;
}

export async function updateAlarm(id: string, updates: Partial<Alarm>): Promise<void> {
  const alarms = await getAlarms();
  const index = alarms.findIndex(a => a.id === id);
  if (index !== -1) {
    alarms[index] = { ...alarms[index], ...updates };
    await saveAlarms(alarms);
  }
}

export async function deleteAlarm(id: string): Promise<void> {
  let alarms = await getAlarms();
  alarms = alarms.filter(a => a.id !== id);
  await saveAlarms(alarms);
}

export async function toggleAlarm(id: string): Promise<void> {
  const alarms = await getAlarms();
  const index = alarms.findIndex(a => a.id === id);
  if (index !== -1) {
    alarms[index].enabled = !alarms[index].enabled;
    // reset snoozes when toggled
    alarms[index].currentSnoozes = 0;
    alarms[index].nextTriggerTimeMs = null;
    await saveAlarms(alarms);
  }
}
