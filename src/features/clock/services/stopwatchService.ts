import { BaseDirectory, readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { StopwatchState } from '../types';

const SW_FILE = 'stopwatch.json';

export async function getStopwatchState(): Promise<StopwatchState> {
  try {
    if (await exists(SW_FILE, { baseDir: BaseDirectory.AppData })) {
      const contents = await readTextFile(SW_FILE, { baseDir: BaseDirectory.AppData });
      return JSON.parse(contents);
    }
  } catch (e) {
    console.error('Failed to load stopwatch:', e);
  }
  
  return {
    running: false,
    startTimeMs: null,
    accumulatedMs: 0,
    elapsedMs: 0,
    laps: []
  };
}

export async function saveStopwatchState(state: StopwatchState): Promise<void> {
  try {
    const updated = { ...state };
    if (updated.running && updated.startTimeMs) {
       updated.elapsedMs = updated.accumulatedMs + (Date.now() - updated.startTimeMs);
    }
    await writeTextFile(SW_FILE, JSON.stringify(updated), { baseDir: BaseDirectory.AppData });
  } catch (e) {
    console.error('Failed to save stopwatch:', e);
  }
}
