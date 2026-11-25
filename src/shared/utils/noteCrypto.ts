/**
 * ─── LAYER 6: AES-256-GCM ENCRYPTION AT REST ────────────────────
 *
 * Encrypts Daily Notes and local API secrets before persisting to IndexedDB.
 *
 * - Tauri Desktop: AES-256-GCM key is persisted inside Windows DPAPI vault
 *   (`secure_store.rs` -> `$APPDATA/.vault/note_key.dpapi`), migrating any
 *   legacy plaintext `$APPDATA/note_key.json`.
 * - Web / Mobile: Non-extractable `CryptoKey` (`extractable: false`) is stored
 *   directly in IndexedDB via WebCrypto structured clone — never exported as
 *   plaintext JWK to `localStorage`.
 */

import { get as idbGet, set as idbSet } from "idb-keyval";
import { isTauri } from "./tauri";

export interface EncryptedPayload {
  /** Version 2 payloads enforce context AAD binding */
  v?: 2;
  /** Base64-encoded 12-byte initialization vector */
  iv: string;
  /** Base64-encoded AES-256-GCM ciphertext */
  ct: string;
}

const LEGACY_KEY_FILE = "note_key.json";
const WEB_KEY_STORE = "w_note_crypto_key";
let cachedKey: CryptoKey | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Clears in-memory CryptoKey references on sign-out or account switch.
 */
export function resetEncryptionKeyCache(): void {
  cachedKey = null;
  initPromise = null;
}

export function initEncryptionKey(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (isTauri()) {
        cachedKey = await loadOrCreateTauriKey();
      } else {
        cachedKey = await loadOrCreateWebKey();
      }
      console.info("[noteCrypto] Encryption key initialised.");
    } catch (err) {
      console.error("[noteCrypto] Failed to initialise encryption key:", err);
      cachedKey = null;
    }
  })();

  return initPromise;
}

async function ensureKey(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;
  await initEncryptionKey();
  return cachedKey;
}

export async function encryptNote(
  plaintext: string,
  aadContext?: string
): Promise<EncryptedPayload | null> {
  const key = await ensureKey();
  if (!key) return null;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const algorithm: AesGcmParams = aadContext
    ? { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aadContext) }
    : { name: "AES-GCM", iv };

  const cipherBuffer = await crypto.subtle.encrypt(algorithm, key, encoded);

  return {
    ...(aadContext ? { v: 2 as const } : {}),
    iv: uint8ToBase64(iv),
    ct: uint8ToBase64(new Uint8Array(cipherBuffer)),
  };
}

export async function decryptNote(
  payload: EncryptedPayload,
  aadContext?: string
): Promise<string | null> {
  const key = await ensureKey();
  if (!key) return null;

  try {
    const iv = base64ToUint8(payload.iv);
    const ct = base64ToUint8(payload.ct);

    if (payload.v === 2) {
      if (!aadContext) {
        console.error("[noteCrypto] Missing required AAD context for v2 encrypted payload.");
        return null;
      }
      const plainBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aadContext) },
        key,
        ct
      );
      return new TextDecoder().decode(plainBuffer);
    }

    // Legacy payloads without v: 2 try context AAD first if supplied, then fall back to AAD-less
    if (aadContext) {
      try {
        const plainWithAad = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aadContext) },
          key,
          ct
        );
        return new TextDecoder().decode(plainWithAad);
      } catch {
        // Fallback to legacy un-bound AAD decryption below
      }
    }

    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ct
    );

    return new TextDecoder().decode(plainBuffer);
  } catch (err) {
    console.error("[noteCrypto] Decryption failed:", err);
    return null;
  }
}

export function isEncryptedRecord(
  record: unknown
): record is { encrypted: EncryptedPayload } {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  if (!r.encrypted || typeof r.encrypted !== "object") return false;
  const enc = r.encrypted as Record<string, unknown>;
  return typeof enc.iv === "string" && typeof enc.ct === "string";
}

// ─── Tauri DPAPI Vault Key Persistence ──────────────────────────

async function loadOrCreateTauriKey(): Promise<CryptoKey> {
  const { invoke } = await import("@tauri-apps/api/core");

  // 1. Try Windows DPAPI vault first
  try {
    const dpapiJson = await invoke<string | null>("secure_store_get", { key: "note_key" });
    if (dpapiJson) {
      const jwk = JSON.parse(dpapiJson) as JsonWebKey;
      return crypto.subtle.importKey("jwk", jwk, "AES-GCM", false, [
        "encrypt",
        "decrypt",
      ]);
    }
  } catch (err) {
    console.warn("[noteCrypto] DPAPI note_key read unavailable, checking legacy file:", err);
  }

  // 2. Migrate legacy plaintext $APPDATA/note_key.json into DPAPI and delete plaintext file
  try {
    const { exists, readTextFile, remove, BaseDirectory } = await import(
      "@tauri-apps/plugin-fs"
    );
    if (await exists(LEGACY_KEY_FILE, { baseDir: BaseDirectory.AppData })) {
      const jwkJson = await readTextFile(LEGACY_KEY_FILE, {
        baseDir: BaseDirectory.AppData,
      });
      const jwk = JSON.parse(jwkJson) as JsonWebKey;
      const key = await crypto.subtle.importKey("jwk", jwk, "AES-GCM", false, [
        "encrypt",
        "decrypt",
      ]);
      await invoke("secure_store_set", { key: "note_key", value: jwkJson }).catch(() => {});
      await remove(LEGACY_KEY_FILE, { baseDir: BaseDirectory.AppData }).catch(() => {});
      console.info("[noteCrypto] Migrated legacy note_key.json into DPAPI vault.");
      return key;
    }
  } catch (err) {
    console.warn("[noteCrypto] Legacy note_key migration check failed:", err);
  }

  // 3. First run — generate extractable once to persist inside DPAPI vault, then re-import non-extractable
  const tempKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", tempKey);
  await invoke("secure_store_set", { key: "note_key", value: JSON.stringify(jwk) });
  console.info("[noteCrypto] New encryption key generated and sealed in DPAPI vault.");

  return crypto.subtle.importKey("jwk", jwk, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

// ─── Web Non-Extractable CryptoKey Persistence ──────────────────

function isCryptoKey(val: unknown): val is CryptoKey {
  return (
    typeof val === "object" &&
    val !== null &&
    "type" in val &&
    "algorithm" in val &&
    "usages" in val
  );
}

async function loadOrCreateWebKey(): Promise<CryptoKey> {
  try {
    const storedIdb = await idbGet<CryptoKey | JsonWebKey>(WEB_KEY_STORE);

    // Modern non-extractable CryptoKey stored via IndexedDB structured clone
    if (isCryptoKey(storedIdb)) {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(WEB_KEY_STORE);
      }
      return storedIdb;
    }

    // Legacy JWK in IndexedDB or localStorage -> import as non-extractable, upgrade IDB, wipe localStorage
    let legacyJwk: JsonWebKey | null = storedIdb && typeof storedIdb === "object" ? storedIdb : null;
    if (!legacyJwk && typeof localStorage !== "undefined") {
      const storedLs = localStorage.getItem(WEB_KEY_STORE);
      if (storedLs) {
        try {
          legacyJwk = JSON.parse(storedLs) as JsonWebKey;
        } catch {
          /* ignore */
        }
      }
    }

    if (legacyJwk) {
      const nonExtractable = await crypto.subtle.importKey(
        "jwk",
        legacyJwk,
        "AES-GCM",
        false,
        ["encrypt", "decrypt"]
      );
      await idbSet(WEB_KEY_STORE, nonExtractable);
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(WEB_KEY_STORE);
      }
      console.info("[noteCrypto] Upgraded legacy JWK to non-extractable CryptoKey.");
      return nonExtractable;
    }
  } catch (err) {
    console.warn("[noteCrypto] Failed to load existing Web encryption key, generating fresh:", err);
  }

  // First run on Web — generate non-extractable CryptoKey directly
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  try {
    await idbSet(WEB_KEY_STORE, key);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(WEB_KEY_STORE);
    }
    console.info("[noteCrypto] New Web encryption key generated and persisted.");
  } catch (err) {
    console.error("[noteCrypto] Failed to persist Web encryption key:", err);
  }

  return key;
}

// ─── Base64 Helpers ─────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
