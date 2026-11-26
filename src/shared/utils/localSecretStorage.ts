import { get as idbGet, set as idbSet } from "idb-keyval";
import { decryptNote, encryptNote, isEncryptedRecord, type EncryptedPayload } from "./noteCrypto";
import { isTauri } from "./tauri";

const GROQ_IDB_PREFIX = "w_local_groq_key_";

function getSafeUid(uid: string): string {
  return (uid || "local_user").replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * Stores the user's Groq API key strictly locally and encrypted at rest
 * (Windows DPAPI vault on Tauri Desktop; AES-GCM with non-extractable WebCrypto key on Web).
 * Never uploaded to Google Drive or stored in plaintext JSON backups.
 */
export async function saveLocalGroqKey(uid: string, apiKey: string): Promise<void> {
  const safeUid = getSafeUid(uid);
  const trimmed = apiKey.trim();

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const rawExisting = await invoke<string | null>("secure_store_get", { key: "groq_key" });
      const map: Record<string, string> = rawExisting ? JSON.parse(rawExisting) : {};
      if (trimmed) {
        map[safeUid] = trimmed;
      } else {
        delete map[safeUid];
      }
      await invoke("secure_store_set", { key: "groq_key", value: JSON.stringify(map) });
      return;
    } catch (err) {
      console.warn("[localSecretStorage] DPAPI groq_key write fallback to encrypted IDB:", err);
    }
  }

  const idbKey = `${GROQ_IDB_PREFIX}${safeUid}`;
  if (!trimmed) {
    await idbSet(idbKey, null);
    return;
  }

  const encrypted = await encryptNote(trimmed, `groq_key:${safeUid}`);
  if (encrypted) {
    await idbSet(idbKey, { encrypted });
  }
}

/**
 * Loads and decrypts the user's locally stored Groq API key.
 */
export async function loadLocalGroqKey(uid: string): Promise<string> {
  const safeUid = getSafeUid(uid);

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const rawExisting = await invoke<string | null>("secure_store_get", { key: "groq_key" });
      if (rawExisting) {
        const map = JSON.parse(rawExisting) as Record<string, string>;
        if (typeof map[safeUid] === "string") {
          return map[safeUid];
        }
      }
    } catch {
      /* fallback to encrypted IDB */
    }
  }

  const idbKey = `${GROQ_IDB_PREFIX}${safeUid}`;
  const stored = await idbGet<{ encrypted?: EncryptedPayload } | null>(idbKey);
  if (stored && isEncryptedRecord(stored)) {
    const plain = await decryptNote(stored.encrypted, `groq_key:${safeUid}`);
    return plain ?? "";
  }
  return "";
}
