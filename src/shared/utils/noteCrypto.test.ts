import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  initEncryptionKey,
  encryptNote,
  decryptNote,
  isEncryptedRecord,
} from "./noteCrypto";

// Mock idb-keyval
const fakeStorage = new Map<string, any>();
vi.mock("idb-keyval", () => ({
  get: vi.fn((key: string) => Promise.resolve(fakeStorage.get(key))),
  set: vi.fn((key: string, val: any) => {
    fakeStorage.set(key, val);
    return Promise.resolve();
  }),
}));

// Mock tauri
vi.mock("./tauri", () => ({
  isTauri: vi.fn(() => false),
}));

describe("noteCrypto encryption module", () => {
  beforeEach(async () => {
    fakeStorage.clear();
    await initEncryptionKey();
  });

  it("identifies valid encrypted records using isEncryptedRecord", () => {
    expect(isEncryptedRecord(null)).toBe(false);
    expect(isEncryptedRecord({})).toBe(false);
    expect(isEncryptedRecord({ encrypted: {} })).toBe(false);
    expect(
      isEncryptedRecord({
        encrypted: { iv: "fake-iv", ct: "fake-ct" },
      })
    ).toBe(true);
  });

  it("encrypts and decrypts notes cleanly (round-trip)", async () => {
    const rawNote = "Tactical operation successful. Daily habit completed!";
    const encrypted = await encryptNote(rawNote);

    expect(encrypted).not.toBeNull();
    expect(encrypted?.iv).toBeTruthy();
    expect(encrypted?.ct).toBeTruthy();

    const decrypted = await decryptNote(encrypted!);
    expect(decrypted).toBe(rawNote);
  });

  it("returns null gracefully if ciphertext is corrupt", async () => {
    const corruptedPayload = {
      iv: "Ym9ndXMtaXY=", // base64 bogus
      ct: "Ym9ndXMtY3Q=",
    };

    const result = await decryptNote(corruptedPayload);
    expect(result).toBeNull();
  });

  it("handles empty strings and long unicode text", async () => {
    const complexNote = "🔥 Day 42: Completed 10km run! 🚀\nMulti-line note\nSymbols: ©, ®, ™";
    const enc = await encryptNote(complexNote);
    expect(enc).not.toBeNull();

    const dec = await decryptNote(enc!);
    expect(dec).toBe(complexNote);
  });
});
