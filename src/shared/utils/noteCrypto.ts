/**
 * ─── LAYER 6: AES-256-GCM ENCRYPTION AT REST ────────────────────
 *
 * Encrypts Daily Note content before it enters IndexedDB and decrypts
 * on read.  The encryption key is a random 256-bit AES-GCM key stored
 * **separately** in Tauri's $APPDATA (OS filesystem), while the
 * ciphertext lives in the browser's IndexedDB — so an attacker needs
 * access to BOTH storage locations to decrypt anything.
 *
 * Web Crypto API — zero external dependencies.
 */

import { isTauri } from "./tauri";

// ─── Types ──────────────────────────────────────────────────────

export interface EncryptedPayload {
  /** Base64-encoded 12-byte initialization vector */
  iv: string;
  /** Base64-encoded AES-256-GCM ciphertext */
  ct: string;
}

// ─── Module State ───────────────────────────────────────────────

const KEY_FILE = "note_key.json";
let cachedKey: CryptoKey | null = null;
let initPromise: Promise<void> | null = null;

// ─── Initialisation ─────────────────────────────────────────────

/**
 * Must be called once during app startup (after auth resolves).
 * Generates or loads the per-device AES-256-GCM key.
 *
 * - Tauri: persists the key as JWK in `$APPDATA/note_key.json`.
 * - Web:  generates an ephemeral in-memory key per session (IndexedDB
 *         is already sandboxed per-origin in browsers).
 */
export function initEncryptionKey(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (isTauri()) {
        cachedKey = await loadOrCreateTauriKey();
      } else {
        // Web fallback: ephemeral key (browser same-origin policy already
        // isolates IndexedDB, so encryption at rest is less critical).
        cachedKey = await crypto.subtle.generateKey(
          { name: "AES-GCM", length: 256 },
          false, // non-extractable — lives only in memory
          ["encrypt", "decrypt"]
        );
      }
      console.info("[noteCrypto] Encryption key initialised.");
    } catch (err) {
      console.error("[noteCrypto] Failed to initialise encryption key:", err);
      // Encryption will gracefully degrade — reads still work because
      // the decrypt path returns plaintext for unencrypted records.
      cachedKey = null;
    }
  })();

  return initPromise;
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────

/**
 * Encrypts a plaintext note string.
 * Returns `null` if the key isn't available (graceful degradation).
 */
export async function encryptNote(
  plaintext: string
): Promise<EncryptedPayload | null> {
  if (!cachedKey) return null;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cachedKey,
    encoded
  );

  return {
    iv: uint8ToBase64(iv),
    ct: uint8ToBase64(new Uint8Array(cipherBuffer)),
  };
}

/**
 * Decrypts an encrypted payload back to plaintext.
 * Returns `null` on failure (key missing, corrupted data, etc.).
 */
export async function decryptNote(
  payload: EncryptedPayload
): Promise<string | null> {
  if (!cachedKey) return null;

  try {
    const iv = base64ToUint8(payload.iv);
    const ct = base64ToUint8(payload.ct);

    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cachedKey,
      ct
    );

    return new TextDecoder().decode(plainBuffer);
  } catch (err) {
    console.error("[noteCrypto] Decryption failed:", err);
    return null;
  }
}

/**
 * Type guard: checks whether a stored record contains an encrypted payload.
 */
export function isEncryptedRecord(
  record: unknown
): record is { encrypted: EncryptedPayload } {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  if (!r.encrypted || typeof r.encrypted !== "object") return false;
  const enc = r.encrypted as Record<string, unknown>;
  return typeof enc.iv === "string" && typeof enc.ct === "string";
}

// ─── Tauri Key Persistence ──────────────────────────────────────

async function loadOrCreateTauriKey(): Promise<CryptoKey> {
  const { exists, readTextFile, writeTextFile, BaseDirectory } = await import(
    "@tauri-apps/plugin-fs"
  );

  // Try loading an existing key
  if (await exists(KEY_FILE, { baseDir: BaseDirectory.AppData })) {
    const jwkJson = await readTextFile(KEY_FILE, {
      baseDir: BaseDirectory.AppData,
    });
    const jwk = JSON.parse(jwkJson) as JsonWebKey;
    return crypto.subtle.importKey("jwk", jwk, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
  }

  // First run — generate and persist
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable so we can export to JWK
    ["encrypt", "decrypt"]
  );

  const jwk = await crypto.subtle.exportKey("jwk", key);
  await writeTextFile(KEY_FILE, JSON.stringify(jwk), {
    baseDir: BaseDirectory.AppData,
  });

  console.info("[noteCrypto] New encryption key generated and saved to $APPDATA.");
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
