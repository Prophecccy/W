import { get, set, keys, getMany } from "idb-keyval";
import { auth } from "../../../shared/config/firebase";
import { HabitLog } from "../../habits/types";
import {
  encryptNote,
  decryptNote,
  isEncryptedRecord,
  type EncryptedPayload,
} from "../../../shared/utils/noteCrypto";

const NOTE_KEY_PREFIX = "note_record_";

export interface LocalNoteRecord {
  date: string;          // YYYY-MM-DD
  notes: string;         // plaintext (empty string when encrypted)
  sync_pending: boolean; // Flag to indicate backup to GDrive is pending
  updatedAt: number;     // Millisecond timestamp
  /** Layer 6: AES-256-GCM encrypted payload (present when encryption is active) */
  encrypted?: EncryptedPayload;
}

// ─── Internal Helpers ───────────────────────────────────────────

/**
 * Encrypts note content and returns a record ready for IndexedDB storage.
 * If encryption is unavailable, falls back to plaintext storage.
 */
async function buildEncryptedRecord(
  date: string,
  content: string,
  syncPending: boolean
): Promise<LocalNoteRecord> {
  const payload = await encryptNote(content);

  if (payload) {
    // Encrypted: store ciphertext in `encrypted`, blank out `notes`
    return {
      date,
      notes: "",
      sync_pending: syncPending,
      updatedAt: Date.now(),
      encrypted: payload,
    };
  }

  // Graceful degradation: encryption key not available
  return {
    date,
    notes: content,
    sync_pending: syncPending,
    updatedAt: Date.now(),
  };
}

/**
 * Reads a record from IndexedDB and decrypts if needed.
 * Handles three cases:
 *   1. Encrypted record  → decrypt and return plaintext
 *   2. Legacy plaintext   → return as-is, re-encrypt in background
 *   3. Missing record     → return null
 */
async function readAndDecryptRecord(
  key: string
): Promise<LocalNoteRecord | null> {
  const raw = await get<LocalNoteRecord>(key);
  if (!raw) return null;

  // Case 1: Encrypted record
  if (isEncryptedRecord(raw)) {
    const plaintext = await decryptNote(raw.encrypted!);
    if (plaintext !== null) {
      return { ...raw, notes: plaintext };
    }
    // Decryption failed — key may have changed. Return empty to avoid
    // exposing garbage. The Drive copy can restore the note.
    console.warn(`[localLogService] Decryption failed for ${key}. Note is unrecoverable locally.`);
    return { ...raw, notes: "" };
  }

  // Case 2: Legacy unencrypted record — re-encrypt in background
  if (raw.notes && raw.notes.trim() !== "") {
    reEncryptLegacyRecord(key, raw).catch(() => {
      /* non-blocking — best effort */
    });
  }

  return raw;
}

/**
 * Background re-encryption of a legacy plaintext record.
 * This transparently migrates old notes to encrypted storage
 * without any user-visible migration step.
 */
async function reEncryptLegacyRecord(
  key: string,
  record: LocalNoteRecord
): Promise<void> {
  const payload = await encryptNote(record.notes);
  if (!payload) return; // encryption not available

  const updated: LocalNoteRecord = {
    ...record,
    notes: "",
    encrypted: payload,
  };
  await set(key, updated);
  console.info(`[localLogService] Re-encrypted legacy record: ${key}`);
}

// ─── Public API (unchanged signatures) ──────────────────────────

/**
 * Saves a daily note locally to IndexedDB, returning immediately to guarantee zero-latency.
 * Marks the note as pending sync.
 * LAYER 6: Note content is AES-256-GCM encrypted before storage.
 */
export async function saveLocalNote(date: string, content: string): Promise<void> {
  const key = `${NOTE_KEY_PREFIX}${date}`;
  const record = await buildEncryptedRecord(date, content, true);

  await set(key, record);

  window.dispatchEvent(
    new CustomEvent("w:note-saved", {
      detail: { date, notes: content, sync_pending: true },
    })
  );
}

/**
 * Saves a daily note downloaded from Google Drive, with sync_pending = false.
 * LAYER 6: Note content is AES-256-GCM encrypted before storage.
 */
export async function saveDownloadedNote(date: string, content: string): Promise<void> {
  const key = `${NOTE_KEY_PREFIX}${date}`;
  const record = await buildEncryptedRecord(date, content, false);

  await set(key, record);

  window.dispatchEvent(
    new CustomEvent("w:note-saved", {
      detail: { date, notes: content, sync_pending: false },
    })
  );
}

/**
 * Retrieves the raw text content of a local daily note.
 * LAYER 6: Transparently decrypts if the record is encrypted.
 */
export async function getLocalNote(date: string): Promise<string> {
  const key = `${NOTE_KEY_PREFIX}${date}`;
  const record = await readAndDecryptRecord(key);
  return record ? record.notes : "";
}

/**
 * Retrieves the full metadata record of a local note.
 * LAYER 6: Transparently decrypts if the record is encrypted.
 */
export async function getLocalNoteRecord(date: string): Promise<LocalNoteRecord | null> {
  const key = `${NOTE_KEY_PREFIX}${date}`;
  return readAndDecryptRecord(key);
}

/**
 * Fetches all local notes that have the sync_pending flag active.
 * LAYER 6: Returns DECRYPTED plaintext so Google Drive sync uploads readable .md files.
 */
export async function getPendingSyncNotes(): Promise<LocalNoteRecord[]> {
  const allKeys = await keys();
  const noteKeys = allKeys.filter((k) => typeof k === "string" && k.startsWith(NOTE_KEY_PREFIX));
  if (noteKeys.length === 0) return [];

  const rawRecords = await getMany<LocalNoteRecord>(noteKeys);
  const pending: LocalNoteRecord[] = [];

  for (const raw of rawRecords) {
    if (!raw || raw.sync_pending !== true) continue;

    if (isEncryptedRecord(raw)) {
      const plaintext = await decryptNote(raw.encrypted!);
      if (plaintext !== null) {
        pending.push({ ...raw, notes: plaintext });
      }
    } else {
      pending.push(raw);
    }
  }

  return pending;
}

/**
 * Clears the sync_pending flag for a successfully back-up note.
 * LAYER 6: Preserves encrypted payload; only updates metadata.
 */
export async function clearSyncPending(
  date: string,
  localStartTimestamp: number,
  serverModifiedTimeMs: number
): Promise<void> {
  const key = `${NOTE_KEY_PREFIX}${date}`;
  const record = await get<LocalNoteRecord>(key); // raw record, keep encrypted
  if (record) {
    if (record.updatedAt > localStartTimestamp) {
      console.info(`[localLogService] Skipping clearSyncPending for ${date}: record was modified during sync.`);
      return;
    }
    record.sync_pending = false;
    record.updatedAt = serverModifiedTimeMs;
    await set(key, record);

    // Broadcast status change — decrypt for event consumers
    let plaintext = record.notes;
    if (isEncryptedRecord(record)) {
      plaintext = (await decryptNote(record.encrypted!)) ?? "";
    }

    window.dispatchEvent(
      new CustomEvent("w:note-saved", {
        detail: { date, notes: plaintext, sync_pending: false },
      })
    );
  }
}

/**
 * System-generated placeholder patterns that should never appear as user notes.
 * These were written by earlier versions of auto-freeze logic.
 */
const SYSTEM_NOTE_PATTERNS = [
  /^\[\s*AUTO-FREEZE\s*\]$/i,
  /^\[\s*FROZEN\s*\]$/i,
  /^\[\s*SYSTEM\s*\]$/i,
];

function isSystemPlaceholder(notes: string): boolean {
  return SYSTEM_NOTE_PATTERNS.some((p) => p.test(notes.trim()));
}

/**
 * Assembles and returns all local Daily Notes as standard HabitLog structures,
 * sorted chronologically with the newest note first.
 * Excludes system-generated placeholder entries (e.g. retroactive auto-freeze logs).
 * LAYER 6: Transparently decrypts all records.
 */
export async function getLocalNoteHistory(): Promise<HabitLog[]> {
  const allKeys = await keys();
  const noteKeys = allKeys.filter((k) => typeof k === "string" && k.startsWith(NOTE_KEY_PREFIX));
  if (noteKeys.length === 0) return [];

  const rawRecords = await getMany<LocalNoteRecord>(noteKeys);
  const decrypted: LocalNoteRecord[] = [];

  for (const raw of rawRecords) {
    if (!raw) continue;

    if (isEncryptedRecord(raw)) {
      const plaintext = await decryptNote(raw.encrypted!);
      if (plaintext !== null && plaintext.trim() !== "" && !isSystemPlaceholder(plaintext)) {
        decrypted.push({ ...raw, notes: plaintext });
      }
    } else if (raw.notes && raw.notes.trim() !== "" && !isSystemPlaceholder(raw.notes)) {
      decrypted.push(raw);
    }
  }

  const userId = auth.currentUser?.uid || "local_user";

  const logs: HabitLog[] = decrypted.map((r) => ({
    date: r.date,
    uid: userId,
    notes: r.notes,
    habits: {},
    // Custom sync metadata field
    sync_pending: r.sync_pending,
  }));

  // Sort descending: YYYY-MM-DD
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

// ─── SECURITY: migrateNotesFromFirestore() DELETED ──────────────
// The legacy Firestore → IndexedDB notes migration has been permanently
// removed. Daily notes NEVER leave the user's local machine (IndexedDB)
// and personal Google Drive. There is no cloud-to-local read path.
// Migration was gated by localStorage flag 'w_gdrive_migrated_notes'
// and has already completed for all existing users.

