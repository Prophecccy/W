import { describe, it, expect, beforeEach, vi } from "vitest";
import { getLocalNoteHistory } from "./localLogService";

const fakeDb = new Map<string, any>();

vi.mock("idb-keyval", () => ({
  get: vi.fn((key: string) => Promise.resolve(fakeDb.get(key))),
  set: vi.fn((key: string, val: any) => {
    fakeDb.set(key, val);
    return Promise.resolve();
  }),
  keys: vi.fn(() => Promise.resolve(Array.from(fakeDb.keys()))),
  getMany: vi.fn((keyList: string[]) =>
    Promise.resolve(keyList.map((k) => fakeDb.get(k)))
  ),
}));

vi.mock("../../../shared/config/firebase", () => ({
  auth: { currentUser: { uid: "test_user_123" } },
}));

vi.mock("../../../shared/utils/noteCrypto", () => ({
  initEncryptionKey: vi.fn(() => Promise.resolve()),
  encryptNote: vi.fn((text: string) =>
    Promise.resolve({ iv: "mock-iv", ct: `enc:${text}` })
  ),
  decryptNote: vi.fn((payload: any) => {
    if (payload.ct && payload.ct.startsWith("enc:")) {
      return Promise.resolve(payload.ct.replace("enc:", ""));
    }
    return Promise.resolve(null);
  }),
  isEncryptedRecord: vi.fn(
    (rec: any) => !!(rec && rec.encrypted && rec.encrypted.ct)
  ),
}));

describe("localLogService - getLocalNoteHistory", () => {
  beforeEach(() => {
    fakeDb.clear();
  });

  it("returns decrypted notes sorted by date descending", async () => {
    fakeDb.set("note_record_2026-08-18", {
      date: "2026-08-18",
      notes: "",
      sync_pending: false,
      updatedAt: 1000,
      encrypted: { iv: "mock-iv", ct: "enc:Older note content" },
    });

    fakeDb.set("note_record_2026-08-19", {
      date: "2026-08-19",
      notes: "",
      sync_pending: false,
      updatedAt: 2000,
      encrypted: { iv: "mock-iv", ct: "enc:Newer note content" },
    });

    const history = await getLocalNoteHistory();
    expect(history.length).toBe(2);
    expect(history[0].date).toBe("2026-08-19");
    expect(history[0].notes).toBe("Newer note content");
    expect(history[1].date).toBe("2026-08-18");
    expect(history[1].notes).toBe("Older note content");
  });

  it("filters out system placeholders like [ AUTO-FREEZE ] and [ FROZEN ]", async () => {
    fakeDb.set("note_record_2026-08-20", {
      date: "2026-08-20",
      notes: "",
      sync_pending: false,
      updatedAt: 3000,
      encrypted: { iv: "mock-iv", ct: "enc:[ AUTO-FREEZE ]" },
    });

    fakeDb.set("note_record_2026-08-21", {
      date: "2026-08-21",
      notes: "",
      sync_pending: false,
      updatedAt: 4000,
      encrypted: { iv: "mock-iv", ct: "enc:Legitimate user journal" },
    });

    const history = await getLocalNoteHistory();
    expect(history.length).toBe(1);
    expect(history[0].date).toBe("2026-08-21");
    expect(history[0].notes).toBe("Legitimate user journal");
  });

  it("recovers legacy notes from w_col_users/{uid}/logs if missing from note_record_", async () => {
    fakeDb.set("w_col_users/test_user_123/logs", {
      "2026-07-10": {
        date: "2026-07-10",
        notes: "Historical note stored in legacy logs map",
        habits: {},
      },
      "2026-07-11": {
        date: "2026-07-11",
        notes: "[ FROZEN ]",
        habits: {},
      },
    });

    const history = await getLocalNoteHistory();
    expect(history.length).toBe(1);
    expect(history[0].date).toBe("2026-07-10");
    expect(history[0].notes).toBe("Historical note stored in legacy logs map");
  });

  it("handles flushAllNotesToDisk gracefully without errors", async () => {
    const { flushAllNotesToDisk, saveLocalNote, getLocalNote } = await import("./localLogService");
    await saveLocalNote("2026-09-01", "Testing daily note save");
    const retrieved = await getLocalNote("2026-09-01");
    expect(retrieved).toBe("Testing daily note save");

    await expect(flushAllNotesToDisk()).resolves.not.toThrow();
  });
});
