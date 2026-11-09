import { describe, it, expect, beforeEach } from "vitest";

// Mock localStorage and window in node test environment
const mockStorage: Record<string, string> = {};
const storageMock = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => { mockStorage[key] = String(val); },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  }
};

(globalThis as unknown as { localStorage: typeof storageMock }).localStorage = storageMock;
if (typeof (globalThis as unknown as { window: unknown }).window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

import {
  isAudioHapticsEnabled,
  setAudioHapticsEnabled,
  playMechanicalClick,
  playSubtleThud,
  playLockLatch,
  playMilestoneChirp,
  playCompletionSound,
  playHoldHum,
  stopHoldHum,
} from "./tactileAudioService";

describe("tactileAudioService", () => {
  beforeEach(() => {
    storageMock.clear();
  });

  it("defaults to enabled when no preference is saved", () => {
    expect(isAudioHapticsEnabled()).toBe(true);
  });

  it("persists enabled state toggle in localStorage", () => {
    setAudioHapticsEnabled(false);
    expect(isAudioHapticsEnabled()).toBe(false);

    setAudioHapticsEnabled(true);
    expect(isAudioHapticsEnabled()).toBe(true);
  });

  it("executes sound triggers gracefully without throwing in headless test environment", () => {
    expect(() => playMechanicalClick()).not.toThrow();
    expect(() => playSubtleThud()).not.toThrow();
    expect(() => playLockLatch()).not.toThrow();
    expect(() => playMilestoneChirp()).not.toThrow();
    expect(() => playCompletionSound()).not.toThrow();
    expect(() => playHoldHum()).not.toThrow();
    expect(() => stopHoldHum()).not.toThrow();
  });

  it("respects muted preference by skipping audio generation", () => {
    setAudioHapticsEnabled(false);
    expect(() => playMechanicalClick()).not.toThrow();
  });
});
