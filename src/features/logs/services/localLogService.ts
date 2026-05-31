import { get, set, keys, getMany } from "idb-keyval";
import { auth } from "../../../shared/config/firebase";
import { HabitLog } from "../../habits/types";

const NOTE_KEY_PREFIX = "note_record_";
const MIGRATED_FLAG_KEY = "w_gdrive_migrated_notes";

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
export async function clearSyncPending(date: string): Promise<void> {
  const key = `${NOTE_KEY_PREFIX}${date}`;
  const record = await get<LocalNoteRecord>(key);
  if (record) {
    record.sync_pending = false;
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
 * Assembles and returns all local Daily Notes as standard HabitLog structures,
 * sorted chronologically with the newest note first.
 */
export async function getLocalNoteHistory(): Promise<HabitLog[]> {
  const allKeys = await keys();
  const noteKeys = allKeys.filter((k) => typeof k === "string" && k.startsWith(NOTE_KEY_PREFIX));
  if (noteKeys.length === 0) return [];

  const records = await getMany<LocalNoteRecord>(noteKeys);
  const validRecords = records.filter((r): r is LocalNoteRecord => !!r);

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

/**
 * Imports historical notes from Firebase Firestore once to initialize the local-first cache.
 */
export async function migrateNotesFromFirestore(userId: string): Promise<void> {
  const userMigratedKey = `${MIGRATED_FLAG_KEY}_${userId}`;
  if (localStorage.getItem(userMigratedKey) === "true") {
    return;
  }

  console.info("[localLogService] First launch: Commencing one-time Firestore daily notes migration...");

  try {
    const { getNoteHistory } = await import("../../habits/services/logService");
    const history = await getNoteHistory(userId);
    
    if (history && history.length > 0) {
      console.info(`[localLogService] Found ${history.length} historical notes to migrate.`);
      
      for (const log of history) {
        if (log.notes && log.notes.trim() !== "") {
          const key = `${NOTE_KEY_PREFIX}${log.date}`;
          const record: LocalNoteRecord = {
            date: log.date,
            notes: log.notes,
            sync_pending: false, // Already backed up in Firestore (historical)
            updatedAt: Date.now(),
          };
          await set(key, record);
        }
      }
    }

    localStorage.setItem(userMigratedKey, "true");
    console.info("[localLogService] Firestore daily notes migration completed successfully.");
  } catch (err) {
    console.error("[localLogService] Failed to complete Firestore daily notes migration:", err);
  }
}
