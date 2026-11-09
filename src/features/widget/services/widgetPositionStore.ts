export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  monitorName?: string;
  monitorIndex?: number;
  relativeX?: number; // offset from top-left of the monitor
  relativeY?: number;
  totalMonitorsWhenSaved?: number;
}

const POSITION_FILE = 'widget_position.json';

const DEFAULT_POSITION: WidgetPosition = {
  x: 100,
  y: 100,
  width: 460,
  height: 620,
};

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let lastPendingPosition: WidgetPosition | null = null;
let isFallbackActive = false;

/** Set whether the widget is currently displaying in temporary fallback mode on the primary monitor. */
export function setFallbackPositionActive(active: boolean) {
  isFallbackActive = active;
}

/** Check if the widget is currently in temporary fallback mode. */
export function isFallbackPositionActive(): boolean {
  return isFallbackActive;
}

export async function loadWidgetPosition(): Promise<WidgetPosition> {
  if (!isTauri) {
    try {
      const contents = localStorage.getItem(POSITION_FILE);
      if (contents) {
        return { ...DEFAULT_POSITION, ...JSON.parse(contents) };
      }
    } catch (e) {
      console.error('Failed to load widget position from localStorage:', e);
    }
    return DEFAULT_POSITION;
  }

  try {
    const { exists, readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    if (await exists(POSITION_FILE, { baseDir: BaseDirectory.AppData })) {
      const contents = await readTextFile(POSITION_FILE, { baseDir: BaseDirectory.AppData });
      return { ...DEFAULT_POSITION, ...JSON.parse(contents) };
    }
  } catch (e) {
    console.error('Failed to load widget position:', e);
  }
  return DEFAULT_POSITION;
}

export async function saveWidgetPosition(pos: WidgetPosition, immediate = false): Promise<void> {
  // If in fallback mode on primary monitor, do NOT overwrite the saved secondary monitor target
  if (isFallbackActive) {
    return;
  }

  lastPendingPosition = pos;

  if (immediate) {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    await flushWidgetPosition(pos);
    return;
  }

  // Debounce: write after 500ms of no movement
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    saveTimeout = null;
    await flushWidgetPosition(pos);
  }, 500);
}

/** Immediately write position to disk, bypassing the debounce.
 *  Call on drag-end and before the window/process is destroyed. */
export async function flushWidgetPosition(pos?: WidgetPosition): Promise<void> {
  // Cancel any pending debounced write
  if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }

  const toSave = pos ?? lastPendingPosition;
  if (!toSave) return;

  if (!isTauri) {
    try {
      localStorage.setItem(POSITION_FILE, JSON.stringify(toSave));
      lastPendingPosition = null;
    } catch (e) {
      console.error('Failed to flush widget position to localStorage:', e);
    }
    return;
  }

  try {
    const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(POSITION_FILE, JSON.stringify(toSave), { baseDir: BaseDirectory.AppData });
    lastPendingPosition = null;
  } catch (e) {
    console.error('Failed to flush widget position:', e);
  }
}

export async function resetWidgetPosition(): Promise<WidgetPosition> {
  if (!isTauri) {
    try {
      localStorage.setItem(POSITION_FILE, JSON.stringify(DEFAULT_POSITION));
    } catch (e) {
      console.error('Failed to reset widget position in localStorage:', e);
    }
    return DEFAULT_POSITION;
  }

  try {
    const { exists, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    if (await exists(POSITION_FILE, { baseDir: BaseDirectory.AppData })) {
      // We don't delete, just overwrite with defaults
      await writeTextFile(POSITION_FILE, JSON.stringify(DEFAULT_POSITION), { baseDir: BaseDirectory.AppData });
    }
  } catch (e) {
    console.error('Failed to reset widget position:', e);
  }
  return DEFAULT_POSITION;
}
