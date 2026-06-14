import { get, set, keys, getMany } from "idb-keyval";
import { auth } from "../../../shared/config/firebase";
import { HabitLog } from "../../habits/types";

const NOTE_KEY_PREFIX = "note_record_";

export interface LocalNoteRecord {
  date: string;          // YYYY-MM-DD
  notes: string;         // note plain content
  sync_pending: boolean; // Flag to indicate backup to GDrive is pending
  updatedAt: number;     // Millisecond timestamp
}

/**
 * Saves a daily note locally to IndexedDB, returning immediately to guarantee zero-latency.
 * Marks the note as pending sync.
 */
export async function saveLocalNote(date: string, content: string): Promise<void> {
  const key = `${NOTE_KEY_PREFIX}${date}`;
  const record: LocalNoteRecord = {
    date,
    notes: content,
    sync_pending: true,
    updatedAt: Date.now(),
  };

  await set(key, record);

  window.dispatchEvent(
    new CustomEvent("w:note-saved", {
      detail: { date, notes: content, sync_pending: true },
    })
  );
}

/**
 * Saves a daily note downloaded from Google Drive, with sync_pending = false.
 */
export async function saveDownloadedNote(date: string, content: string): Promise<void> {
  const key = `${NOTE_KEY_PREFIX}${date}`;
  const record: LocalNoteRecord = {
    date,
    notes: content,
    sync_pending: false,
    updatedAt: Date.now(),
  };

  await set(key, record);

  window.dispatchEvent(
    new CustomEvent("w:note-saved", {
      detail: { date, notes: content, sync_pending: false },
    })
  );
}

/**
 * Retrieves the raw text content of a local daily note.
 */
export async function getLocalNote(date: string): Promise<string> {
  const key = `${NOTE_KEY_PREFIX}${date}`;
  const record = await get<LocalNoteRecord>(key);
  return record ? record.notes : "";
}

/**
 * Retrieves the full metadata record of a local note.
 */
export async function getLocalNoteRecord(date: string): Promise<LocalNoteRecord | null> {
  const key = `${NOTE_KEY_PREFIX}${date}`;
  const record = await get<LocalNoteRecord>(key);
  return record || null;
}

/**
 * Fetches all local notes that have the sync_pending flag active.
 */
export async function getPendingSyncNotes(): Promise<LocalNoteRecord[]> {
  const allKeys = await keys();
  const noteKeys = allKeys.filter((k) => typeof k === "string" && k.startsWith(NOTE_KEY_PREFIX));
  if (noteKeys.length === 0) return [];

  const records = await getMany<LocalNoteRecord>(noteKeys);
  // Filter records that are pending sync, removing null/undefined entries
  return records.filter((r): r is LocalNoteRecord => !!r && r.sync_pending === true);
}

/**
 * Clears the sync_pending flag for a successfully back-up note.
 */
export async function clearSyncPending(
  date: string,
  localStartTimestamp: number,
  serverModifiedTimeMs: number
): Promise<void> {
  const key = `${NOTE_KEY_PREFIX}${date}`;
  const record = await get<LocalNoteRecord>(key);
  if (record) {
    if (record.updatedAt > localStartTimestamp) {
      console.info(`[localLogService] Skipping clearSyncPending for ${date}: record was modified during sync.`);
      return;
    }
    record.sync_pending = false;
    record.updatedAt = serverModifiedTimeMs;
    await set(key, record);
    
    // Broadcast status change
    window.dispatchEvent(
      new CustomEvent("w:note-saved", {
        detail: { date, notes: record.notes, sync_pending: false },
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
 */
export async function getLocalNoteHistory(): Promise<HabitLog[]> {
  const allKeys = await keys();
  const noteKeys = allKeys.filter((k) => typeof k === "string" && k.startsWith(NOTE_KEY_PREFIX));
  if (noteKeys.length === 0) return [];

  const records = await getMany<LocalNoteRecord>(noteKeys);
  const validRecords = records.filter(
    (r): r is LocalNoteRecord => !!r && !!r.notes && r.notes.trim() !== "" && !isSystemPlaceholder(r.notes)
  );

  const userId = auth.currentUser?.uid || "local_user";

  const logs: HabitLog[] = validRecords.map((r) => ({
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

