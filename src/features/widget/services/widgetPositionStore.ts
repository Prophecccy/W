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
let lastKnownValidPosition: WidgetPosition | null = null;

/** Set whether the widget is currently displaying in temporary fallback mode on the primary monitor. */
export function setFallbackPositionActive(active: boolean) {
  isFallbackActive = active;
}

/** Check if the widget is currently in temporary fallback mode. */
export function isFallbackPositionActive(): boolean {
  return isFallbackActive;
}

/** Helper to validate if a position represents an intentional user coordinate rather than OS startup cascade default */
function isIntentionalCoordinate(pos?: Partial<WidgetPosition> | null): boolean {
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return false;
  // Windows OS default cascade coordinates are (64, 64)
  if (pos.x === 64 && pos.y === 64) return false;
  return true;
}

export async function loadWidgetPosition(): Promise<WidgetPosition> {
  // 1. First read from synchronous localStorage (fastest & matches Sticky Notes resilience)
  let localSaved: WidgetPosition | null = null;
  try {
    const raw = localStorage.getItem(POSITION_FILE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        localSaved = { ...DEFAULT_POSITION, ...parsed };
      }
    }
  } catch (e) {
    console.error('Failed to load widget position from localStorage:', e);
  }

  if (!isTauri) {
    if (localSaved) {
      lastKnownValidPosition = localSaved;
      return localSaved;
    }
    return DEFAULT_POSITION;
  }

  // 2. In Tauri, also read from AppData filesystem
  let diskSaved: WidgetPosition | null = null;
  try {
    const { exists, readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    if (await exists(POSITION_FILE, { baseDir: BaseDirectory.AppData })) {
      const contents = await readTextFile(POSITION_FILE, { baseDir: BaseDirectory.AppData });
      const parsed = JSON.parse(contents);
      if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        diskSaved = { ...DEFAULT_POSITION, ...parsed };
      }
    }
  } catch (e) {
    console.error('Failed to load widget position from disk:', e);
  }

  // 3. Coordinate reconciliation:
  // If disk contains (64, 64) OS default or uninitialized coords but localStorage has an intentional user placement,
  // recover the user placement from localStorage!
  let resolved: WidgetPosition = DEFAULT_POSITION;
  if (diskSaved && isIntentionalCoordinate(diskSaved)) {
    resolved = diskSaved;
  } else if (localSaved && isIntentionalCoordinate(localSaved)) {
    resolved = localSaved;
  } else if (diskSaved) {
    resolved = diskSaved;
  } else if (localSaved) {
    resolved = localSaved;
  }

  // Mirror resolved position to both caches
  lastKnownValidPosition = resolved;
  try {
    localStorage.setItem(POSITION_FILE, JSON.stringify(resolved));
  } catch {}

  return resolved;
}

export async function saveWidgetPosition(pos: WidgetPosition, immediate = false): Promise<void> {
  // If in fallback mode on primary monitor, do NOT overwrite the saved secondary monitor target
  if (isFallbackActive) {
    return;
  }

  // Reject accidental saves of (64, 64) Windows default cascade if a valid position is already known
  if (!isIntentionalCoordinate(pos) && lastKnownValidPosition && isIntentionalCoordinate(lastKnownValidPosition)) {
    console.warn('[widgetPositionStore] Rejected attempt to overwrite user position with OS default (64, 64)');
    return;
  }

  lastPendingPosition = pos;
  lastKnownValidPosition = pos;

  // Immediately mirror to localStorage synchronously (ensures zero data loss across restarts)
  try {
    localStorage.setItem(POSITION_FILE, JSON.stringify(pos));
  } catch (e) {
    console.error('Failed to save widget position to localStorage:', e);
  }

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

  // Always keep localStorage up to date
  try {
    localStorage.setItem(POSITION_FILE, JSON.stringify(toSave));
  } catch {}

  if (!isTauri) {
    lastPendingPosition = null;
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
  lastKnownValidPosition = DEFAULT_POSITION;
  try {
    localStorage.setItem(POSITION_FILE, JSON.stringify(DEFAULT_POSITION));
  } catch (e) {
    console.error('Failed to reset widget position in localStorage:', e);
  }

  if (!isTauri) {
    return DEFAULT_POSITION;
  }

  try {
    const { exists, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    if (await exists(POSITION_FILE, { baseDir: BaseDirectory.AppData })) {
      await writeTextFile(POSITION_FILE, JSON.stringify(DEFAULT_POSITION), { baseDir: BaseDirectory.AppData });
    }
  } catch (e) {
    console.error('Failed to reset widget position:', e);
  }
  return DEFAULT_POSITION;
}
