// ─── Types ──────────────────────────────────────────────────────

export interface StickyPlacement {
  x: number;
  y: number;
  monitorName?: string;
  monitorIndex?: number;
  relativeX?: number; // offset from top-left of the monitor where it was placed
  relativeY?: number;
  totalMonitorsWhenSaved?: number;
}

export interface PositionMap {
  [todoId: string]: { x: number; y: number };
}

export interface PlacementMap {
  [todoId: string]: StickyPlacement;
}

const STORAGE_KEY_POS = "w_sticky_positions";
const STORAGE_KEY_PLACEMENTS = "w_sticky_placements";

// ─── Local Storage (Persistent Local Placements) ─────────────────
// Local-only persistence: remembers note placements and monitor context
// across PC restarts without sending coordinates to cloud.

export function loadPlacementsLocal(): PlacementMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PLACEMENTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as PlacementMap;
      }
    }
  } catch (e) {
    console.error("Failed to load sticky placements locally:", e);
  }

  // Fallback to legacy positions if placements not yet saved
  const legacy = loadPositions();
  const converted: PlacementMap = {};
  for (const [id, pos] of Object.entries(legacy)) {
    converted[id] = { x: pos.x, y: pos.y };
  }
  return converted;
}

export function savePlacementsLocal(placements: PlacementMap): void {
  try {
    localStorage.setItem(STORAGE_KEY_PLACEMENTS, JSON.stringify(placements));
    // Also mirror to legacy key for backwards compatibility
    const posMap: PositionMap = {};
    for (const [id, p] of Object.entries(placements)) {
      posMap[id] = { x: p.x, y: p.y };
    }
    localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(posMap));
  } catch (e) {
    console.error("Failed to save sticky placements locally:", e);
  }
}

export function saveStickyPlacementLocal(todoId: string, placement: StickyPlacement): void {
  const placements = loadPlacementsLocal();
  placements[todoId] = placement;
  savePlacementsLocal(placements);
}

export function loadPositions(): PositionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_POS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as PositionMap;
    }
    return {};
  } catch {
    return {};
  }
}

export function savePositionsLocal(positions: PositionMap): void {
  try {
    localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(positions));
  } catch (e) {
    console.error("Failed to save sticky positions locally:", e);
  }
}

export function savePositionLocal(todoId: string, pos: { x: number; y: number }): void {
  saveStickyPlacementLocal(todoId, { x: pos.x, y: pos.y });
}

export function removePositionLocal(todoId: string): void {
  const placements = loadPlacementsLocal();
  delete placements[todoId];
  savePlacementsLocal(placements);

  const positions = loadPositions();
  delete positions[todoId];
  savePositionsLocal(positions);
}

// ─── Local-only coordinate management ───────────────────────────
// Cloud coordinate syncing disabled per architectural standard:
// physical screen coordinates are machine-specific and are preserved
// exclusively on local storage across PC shutdowns.

export function syncPositionToFirestore(_todoId: string, _pos: { x: number; y: number }): void {
  // Local-only persistence: intentional no-op to prevent cloud overwriting local monitor coordinates
}

export async function flushPendingSyncs(): Promise<void> {
  // Placements are saved synchronously to localStorage immediately upon drag release
}
