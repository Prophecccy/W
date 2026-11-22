import { describe, it, expect, beforeEach, vi } from "vitest";

const fakeUserDoc: any = {
  freeze: {
    active: false,
    startDate: null,
    endDate: null,
    reason: null,
    lastInteractionDate: "2026-11-19",
    history: [],
  },
  lastActiveDate: "2026-11-19",
};

const fakeLogs: Record<string, any> = {};

vi.mock("../../../shared/config/firebase", () => ({
  db: {},
  auth: {
    currentUser: { uid: "test-user-456" },
  },
  doc: vi.fn((...args: string[]) => ({
    type: "document",
    path: args.slice(1).join("/"),
    id: args[args.length - 1],
  })),
  getDoc: vi.fn((docRef: any) => {
    if (docRef.path === "users/test-user-456") {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ ...fakeUserDoc }),
      });
    }
    const logMatch = docRef.path.match(/users\/test-user-456\/logs\/(.+)/);
    if (logMatch) {
      const date = logMatch[1];
      const data = fakeLogs[date];
      return Promise.resolve({
        exists: () => !!data,
        data: () => data || {},
      });
    }
    return Promise.resolve({ exists: () => false, data: () => null });
  }),
  updateDoc: vi.fn((_docRef: any, updates: any) => {
    Object.assign(fakeUserDoc, updates);
    return Promise.resolve();
  }),
  collection: vi.fn((...args: string[]) => ({
    type: "collection",
    path: args.slice(1).join("/"),
  })),
  query: vi.fn((col: any, ...constraints: any[]) => ({
    col,
    constraints,
  })),
  where: vi.fn((field: string, op: string, val: any) => ({ field, op, val })),
  getDocs: vi.fn((_q: any) => {
    const docs = Object.entries(fakeLogs).map(([date, data]) => ({
      id: date,
      data: () => data,
    }));
    return Promise.resolve({
      size: docs.length,
      docs,
      forEach: (fn: any) => docs.forEach(fn),
    });
  }),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
  arrayUnion: vi.fn((entry: any) => [entry]),
}));

import { checkAutoFreeze, updateInteractionDate } from "./freezeService";

describe("freezeService - Log-Aware Cross-Device Auto-Freeze", () => {
  beforeEach(() => {
    fakeUserDoc.freeze = {
      active: false,
      startDate: null,
      endDate: null,
      reason: null,
      lastInteractionDate: "2026-11-19",
      history: [],
    };
    fakeUserDoc.lastActiveDate = "2026-11-19";
    for (const key of Object.keys(fakeLogs)) {
      delete fakeLogs[key];
    }
  });

  it("bypasses auto-freeze when cross-device logs prove recent habit completions", async () => {
    // Desktop user completed a habit on Nov 21 and Nov 22
    fakeLogs["2026-11-21"] = {
      habits: {
        "habit_pushups": { completed: true, value: 20 },
      },
    };

    // Web app opens on Nov 22 with stale lastInteractionDate = 2026-11-19 (3-day gap)
    const result = await checkAutoFreeze("2026-11-19", "2026-11-22");

    // Must NOT trigger auto-freeze because Nov 21 has active habits
    expect(result.triggered).toBe(false);
    expect(result.frozenSince).toBeNull();
    // Must update lastActiveDate to latest logged date
    expect(fakeUserDoc.lastActiveDate).toBe("2026-11-21");
  });

  it("triggers auto-freeze when user was genuinely absent for >= 3 days without logs", async () => {
    // No logs exist between Nov 19 and Nov 22
    const result = await checkAutoFreeze("2026-11-19", "2026-11-22");

    expect(result.triggered).toBe(true);
    expect(result.frozenSince).toBe("2026-11-20");
  });

  it("updateInteractionDate touches lastActiveDate and freeze.lastInteractionDate", async () => {
    await updateInteractionDate("2026-11-22");
    expect(fakeUserDoc.lastActiveDate).toBe("2026-11-22");
    expect(fakeUserDoc["freeze.lastInteractionDate"]).toBe("2026-11-22");
  });
});
