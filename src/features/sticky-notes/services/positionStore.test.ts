import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPlacementsLocal,
  saveStickyPlacementLocal,
  removePositionLocal,
  loadPositions,
} from './positionStore';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => storageMap.set(key, String(val)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};
globalThis.localStorage = mockLocalStorage as any;

describe('positionStore (Multi-Monitor Local-Only Persistence)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads multi-monitor placement with monitor context locally', () => {
    saveStickyPlacementLocal('todo-1', {
      x: 2150,
      y: 180,
      monitorName: '\\\\.\\DISPLAY2',
      relativeX: 230,
      relativeY: 180,
      totalMonitorsWhenSaved: 2,
    });

    const placements = loadPlacementsLocal();
    expect(placements['todo-1']).toBeDefined();
    expect(placements['todo-1'].x).toBe(2150);
    expect(placements['todo-1'].y).toBe(180);
    expect(placements['todo-1'].monitorName).toBe('\\\\.\\DISPLAY2');
    expect(placements['todo-1'].relativeX).toBe(230);
    expect(placements['todo-1'].relativeY).toBe(180);
    expect(placements['todo-1'].totalMonitorsWhenSaved).toBe(2);

    // Also mirrors to legacy loadPositions for backward compatibility
    const legacy = loadPositions();
    expect(legacy['todo-1']).toEqual({ x: 2150, y: 180 });
  });

  it('removes note placement cleanly from both stores', () => {
    saveStickyPlacementLocal('todo-2', {
      x: 100,
      y: 200,
      monitorName: '\\\\.\\DISPLAY1',
    });

    expect(loadPlacementsLocal()['todo-2']).toBeDefined();
    removePositionLocal('todo-2');
    expect(loadPlacementsLocal()['todo-2']).toBeUndefined();
    expect(loadPositions()['todo-2']).toBeUndefined();
  });

  it('migrates legacy coordinate cache seamlessly', () => {
    localStorage.setItem('w_sticky_positions', JSON.stringify({
      'legacy-todo': { x: 500, y: 600 }
    }));

    const placements = loadPlacementsLocal();
    expect(placements['legacy-todo']).toEqual({ x: 500, y: 600 });
  });
});
