import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadWidgetPosition,
  saveWidgetPosition,
  setFallbackPositionActive,
  isFallbackPositionActive,
} from './widgetPositionStore';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => storageMap.set(key, String(val)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};
globalThis.localStorage = mockLocalStorage as any;

describe('widgetPositionStore (Multi-Monitor Fallback & Persistence)', () => {
  beforeEach(() => {
    localStorage.clear();
    setFallbackPositionActive(false);
  });

  it('loads default widget position if no local file or cache exists', async () => {
    const pos = await loadWidgetPosition();
    expect(pos).toEqual({
      x: 100,
      y: 100,
      width: 460,
      height: 620,
    });
  });

  it('saves and immediately flushes multi-monitor target position', async () => {
    await saveWidgetPosition({
      x: 2100,
      y: 120,
      width: 460,
      height: 620,
      monitorName: '\\\\.\\DISPLAY2',
      relativeX: 180,
      relativeY: 120,
      totalMonitorsWhenSaved: 2,
    }, true);

    const loaded = await loadWidgetPosition();
    expect(loaded.x).toBe(2100);
    expect(loaded.y).toBe(120);
    expect(loaded.monitorName).toBe('\\\\.\\DISPLAY2');
  });

  it('blocks saving when fallback position mode is active to preserve secondary monitor target', async () => {
    // 1. Saved target on monitor 2
    await saveWidgetPosition({
      x: 2100,
      y: 120,
      width: 460,
      height: 620,
      monitorName: '\\\\.\\DISPLAY2',
    }, true);

    // 2. Fallback mode is activated because monitor 2 was disconnected
    setFallbackPositionActive(true);
    expect(isFallbackPositionActive()).toBe(true);

    // 3. Temporary primary monitor bounds reposition attempt
    await saveWidgetPosition({
      x: 50,
      y: 50,
      width: 460,
      height: 620,
      monitorName: '\\\\.\\DISPLAY1',
    }, true);

    // 4. Stored position must STILL be the deliberate Monitor 2 position!
    const loaded = await loadWidgetPosition();
    expect(loaded.x).toBe(2100);
    expect(loaded.y).toBe(120);
    expect(loaded.monitorName).toBe('\\\\.\\DISPLAY2');
  });

  it('rejects overwriting a valid user position with OS startup default (64, 64)', async () => {
    // 1. User previously positioned widget at (1400, 350)
    await saveWidgetPosition({
      x: 1400,
      y: 350,
      width: 460,
      height: 620,
    }, true);

    // 2. Windows boot sends an uninitialized cascade position (64, 64)
    await saveWidgetPosition({
      x: 64,
      y: 64,
      width: 460,
      height: 620,
    }, true);

    // 3. Must preserve user position (1400, 350) and reject (64, 64)
    const loaded = await loadWidgetPosition();
    expect(loaded.x).toBe(1400);
    expect(loaded.y).toBe(350);
  });

  it('synchronously persists to and recovers from localStorage', async () => {
    await saveWidgetPosition({
      x: 950,
      y: 200,
      width: 400,
      height: 700,
    }, true);

    const raw = localStorage.getItem('widget_position.json');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.x).toBe(950);
    expect(parsed.y).toBe(200);

    const loaded = await loadWidgetPosition();
    expect(loaded.x).toBe(950);
    expect(loaded.y).toBe(200);
  });
});
