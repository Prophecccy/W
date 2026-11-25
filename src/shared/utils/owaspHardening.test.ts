import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { memIdb } = vi.hoisted(() => ({
  memIdb: new Map<string, unknown>(),
}));

vi.mock("idb-keyval", () => ({
  get: async (key: string) => memIdb.get(key) ?? null,
  set: async (key: string, val: unknown) => {
    memIdb.set(key, val);
  },
}));

import { loadLocalGroqKey, saveLocalGroqKey } from "./localSecretStorage";
import { decryptNote, encryptNote } from "./noteCrypto";
import { computePayloadSha256 } from "./integrity";
import { restoreBackup } from "../../features/settings/services/backupService";
import { escapeCSV } from "../../features/settings/services/exportService";
import { doc, updateDoc, db } from "../services/localDb";

describe("OWASP Runtime Storage & Restore Hardening", () => {
  const memLocalStorage = new Map<string, string>();

  beforeEach(() => {
    memIdb.clear();
    memLocalStorage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => memLocalStorage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memLocalStorage.set(k, v);
      },
      removeItem: (k: string) => {
        memLocalStorage.delete(k);
      },
      clear: () => memLocalStorage.clear(),
    });
    vi.stubGlobal("window", {
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encrypts Groq API key locally per UID without storing plaintext in IndexedDB", async () => {
    const secretKey = "gsk_test_super_secret_groq_key_123456";
    await saveLocalGroqKey("uid_alice", secretKey);

    const rawStored = memIdb.get("w_local_groq_key_uid_alice") as { encrypted?: unknown } | undefined;
    expect(rawStored?.encrypted).toBeDefined();
    expect(JSON.stringify(rawStored)).not.toContain(secretKey);

    expect(await loadLocalGroqKey("uid_alice")).toBe(secretKey);
    expect(await loadLocalGroqKey("uid_bob")).toBe("");
  });

  it("enforces AES-GCM AAD context binding across UIDs/purposes while preserving legacy note decryption", async () => {
    const aliceSealed = await encryptNote("top-secret-note", "note:uid_alice:2026-11-25");
    expect(aliceSealed?.v).toBe(2);
    expect(await decryptNote(aliceSealed!, "note:uid_alice:2026-11-25")).toBe("top-secret-note");
    expect(await decryptNote(aliceSealed!, "note:uid_bob:2026-11-25")).toBeNull();
    expect(await decryptNote(aliceSealed!)).toBeNull();

    const legacyUnbound = await encryptNote("legacy-plaintext");
    expect(legacyUnbound?.v).toBeUndefined();
    expect(await decryptNote(legacyUnbound!, "note:uid_alice:2026-11-25")).toBe("legacy-plaintext");
  });

  it("restoreBackup pins active UID, strips groqApiKey, filters user fields, and rejects traversal IDs", async () => {
    memLocalStorage.set(
      "w_auth_user",
      JSON.stringify({ uid: "uid_alice", email: "alice@example.com" })
    );

    await restoreBackup({
      user: {
        uid: "uid_attacker",
        email: "attacker@evil.com",
        role: "admin",
        isAdmin: true,
        hasOnboarded: true,
        settings: {
          theme: "dark",
          groqApiKey: "gsk_leaked_secret",
        },
      },
      habits: [
        { id: "../escaped_path", uid: "uid_attacker", name: "Bad" },
        { id: "habit_1", uid: "uid_attacker", name: "Read" },
      ],
      logs: [
        { id: "2026-11-24", completedHabits: ["habit_1"], notes: "forged-note-in-logs" },
      ],
    });

    const restoredUser = memIdb.get("w_doc_users/uid_alice") as Record<string, any>;
    expect(restoredUser.uid).toBe("uid_alice");
    expect(restoredUser.email).toBe("alice@example.com");
    expect(restoredUser.role).toBeUndefined();
    expect(restoredUser.isAdmin).toBeUndefined();
    expect(restoredUser.settings?.groqApiKey).toBeUndefined();
    expect(restoredUser.settings?.theme).toBe("dark");

    const habitsMap = memIdb.get("w_col_users/uid_alice/habits") as Record<string, any>;
    expect(habitsMap["../escaped_path"]).toBeUndefined();
    expect(habitsMap["habit_1"].uid).toBe("uid_alice");

    const logsMap = memIdb.get("w_col_users/uid_alice/logs") as Record<string, any>;
    expect(logsMap["2026-11-24"].uid).toBe("uid_alice");
    expect(logsMap["2026-11-24"].notes).toBeUndefined();
  });

  it("neutralizes CSV formula injection and blocks dotted prototype pollution in updateDoc", async () => {
    expect(escapeCSV("=CMD|'/C calc'!A0")).toBe("'=CMD|'/C calc'!A0");
    expect(escapeCSV("+1+1")).toBe("'+1+1");
    expect(escapeCSV("-2+3")).toBe("'-2+3");
    expect(escapeCSV("@SUM(1,2)")).toBe(`"'@SUM(1,2)"`);
    expect(escapeCSV('\t=HYPERLINK("http://evil","x")')).toBe(`"'\t=HYPERLINK(""http://evil"",""x"")"`);
    expect(escapeCSV("Normal Habit")).toBe("Normal Habit");

    const ref = doc(db, "users", "uid_alice", "habits", "h1");
    await updateDoc(ref, {
      "__proto__.polluted": true,
      "constructor.prototype.pwned": "yes",
      title: "Clean Title",
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).pwned).toBeUndefined();
    const habits = memIdb.get("w_col_users/uid_alice/habits") as Record<string, any>;
    expect(habits["h1"].title).toBe("Clean Title");
  });

  it("rejects tampered signed backups and clamps restored strikes bounds (A08)", async () => {
    memLocalStorage.set(
      "w_auth_user",
      JSON.stringify({ uid: "uid_alice", email: "alice@example.com" })
    );

    const unsignedBackup = {
      version: 1,
      user: {
        hasOnboarded: true,
        strikes: {
          current: 999,
          history: Array.from({ length: 600 }, (_, i) => `2026-01-${i}`),
        },
      },
      habits: [{ id: "h_signed", name: "Verified Habit" }],
    };
    const integritySha256 = await computePayloadSha256(unsignedBackup);
    const tamperedBackup = {
      ...unsignedBackup,
      user: { ...unsignedBackup.user, hasOnboarded: false },
      integritySha256,
    };

    await expect(restoreBackup(tamperedBackup)).rejects.toThrow(
      "Backup integrity verification failed"
    );
    expect(memIdb.get("w_doc_users/uid_alice")).toBeUndefined();

    await restoreBackup({ ...unsignedBackup, integritySha256 });
    const restoredUser = memIdb.get("w_doc_users/uid_alice") as Record<string, any>;
    expect(restoredUser.hasOnboarded).toBe(true);
    expect(restoredUser.strikes.current).toBe(5);
    expect(restoredUser.strikes.history).toHaveLength(500);

    const restoredHabits = memIdb.get("w_col_users/uid_alice/habits") as Record<string, any>;
    expect(restoredHabits["h_signed"].name).toBe("Verified Habit");
  });
});
