import { BaseDirectory, readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';

const POSITION_FILE = 'widget_position.json';

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_POSITION: WidgetPosition = {
  x: 100,
  y: 100,
  width: 380,
  height: 520,
};

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export async function loadWidgetPosition(): Promise<WidgetPosition> {
  try {
    if (await exists(POSITION_FILE, { baseDir: BaseDirectory.AppData })) {
      const contents = await readTextFile(POSITION_FILE, { baseDir: BaseDirectory.AppData });
      return { ...DEFAULT_POSITION, ...JSON.parse(contents) };
    }
  } catch (e) {
    console.error('Failed to load widget position:', e);
  }
  return DEFAULT_POSITION;
}

export async function saveWidgetPosition(pos: WidgetPosition): Promise<void> {
  // Debounce: only write after 500ms of no movement
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await writeTextFile(POSITION_FILE, JSON.stringify(pos), { baseDir: BaseDirectory.AppData });
    } catch (e) {
      console.error('Failed to save widget position:', e);
    }
  }, 500);
}

export async function resetWidgetPosition(): Promise<WidgetPosition> {
  try {
    if (await exists(POSITION_FILE, { baseDir: BaseDirectory.AppData })) {
      // We don't delete, just overwrite with defaults
      await writeTextFile(POSITION_FILE, JSON.stringify(DEFAULT_POSITION), { baseDir: BaseDirectory.AppData });
    }
  } catch (e) {
    console.error('Failed to reset widget position:', e);
  }
  return DEFAULT_POSITION;
}
