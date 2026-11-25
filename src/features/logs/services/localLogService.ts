import { get, set, del, keys, getMany } from "idb-keyval";
import { auth } from "../../../shared/config/firebase";
import { HabitLog } from "../../habits/types";
import {
  initEncryptionKey,
  encryptNote,
  decryptNote,
  isEncryptedRecord,
  type EncryptedPayload,
} from "../../../shared/utils/noteCrypto";
import { sanitizeText, validateIsoDate } from "../../../shared/utils/security";
import { isTauri } from "../../../shared/utils/tauri";

const LEGACY_NOTE_KEY_PREFIX = "note_record_";
const LEGACY_NOTE_KEY_REGEX = /^note_record_(\d{4}-\d{2}-\d{2})$/;
const NOTES_DIR = "notes";

function getSafeUid(): string {
  const raw = auth.currentUser?.uid || "local_user";
  return raw.replace(/[^A-Za-z0-9_-]/g, "_");
}

function getScopedNotePrefix(): string {
  return `note_record_${getSafeUid()}_`;
}

function getScopedNoteKey(date: string): string {
  return `${getScopedNotePrefix()}${date}`;
}

function getScopedDiskDir(): string {
  return `${NOTES_DIR}/${getSafeUid()}`;
}

function getNoteAadContext(date: string): string {
  return `note:${getSafeUid()}:${date}`;
}

// ─── Native Disk Helpers (Tauri $APPDATA/notes/<uid>/) ────────────

async function saveNoteToDisk(date: string, record: LocalNoteRecord): Promise<void> {
  if (!isTauri() || !validateIsoDate(date)) return;
  try {
    const { writeTextFile, mkdir, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    const scopedDir = getScopedDiskDir();
    if (!(await exists(scopedDir, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(scopedDir, { baseDir: BaseDirectory.AppData, recursive: true });
    }
    const filePath = `${scopedDir}/${date}.json`;
    await writeTextFile(filePath, JSON.stringify(record), { baseDir: BaseDirectory.AppData });
  } catch (err) {
    console.warn(`[localLogService] Failed to mirror note ${date} to disk:`, err);
  }
}

async function readNoteFromDisk(date: string): Promise<LocalNoteRecord | null> {
  if (!isTauri() || !validateIsoDate(date)) return null;
  try {
    const { readTextFile, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    const scopedPath = `${getScopedDiskDir()}/${date}.json`;
    if (await exists(scopedPath, { baseDir: BaseDirectory.AppData })) {
      const content = await readTextFile(scopedPath, { baseDir: BaseDirectory.AppData });
      return JSON.parse(content) as LocalNoteRecord;
    }
    // One-time migration fallback from legacy unscoped disk path
    const legacyPath = `${NOTES_DIR}/${date}.json`;
    if (await exists(legacyPath, { baseDir: BaseDirectory.AppData })) {
      const content = await readTextFile(legacyPath, { baseDir: BaseDirectory.AppData });
      const parsed = JSON.parse(content) as LocalNoteRecord;
      await saveNoteToDisk(date, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn(`[localLogService] Failed to read note ${date} from disk:`, err);
  }
  return null;
}

async function readAllNotesFromDisk(): Promise<LocalNoteRecord[]> {
  if (!isTauri()) return [];
  try {
    const { readDir, readTextFile, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    const records: LocalNoteRecord[] = [];
    const seenDates = new Set<string>();

    const scopedDir = getScopedDiskDir();
    if (await exists(scopedDir, { baseDir: BaseDirectory.AppData })) {
      const entries = await readDir(scopedDir, { baseDir: BaseDirectory.AppData });
      for (const entry of entries) {
        const match = entry.name?.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
        if (!match || !validateIsoDate(match[1])) continue;
        try {
          const content = await readTextFile(`${scopedDir}/${entry.name}`, { baseDir: BaseDirectory.AppData });
          const parsed = JSON.parse(content) as LocalNoteRecord;
          if (parsed && parsed.date && validateIsoDate(parsed.date)) {
            records.push(parsed);
            seenDates.add(parsed.date);
          }
        } catch (e) {
          console.warn(`[localLogService] Corrupted disk note file ${entry.name}:`, e);
        }
      }
    }

    // Migrate any legacy unscoped disk notes in $APPDATA/notes/YYYY-MM-DD.json
    if (await exists(NOTES_DIR, { baseDir: BaseDirectory.AppData })) {
      const legacyEntries = await readDir(NOTES_DIR, { baseDir: BaseDirectory.AppData });
      for (const entry of legacyEntries) {
        const match = entry.name?.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
        if (!match || !validateIsoDate(match[1]) || seenDates.has(match[1])) continue;
        try {
          const content = await readTextFile(`${NOTES_DIR}/${entry.name}`, { baseDir: BaseDirectory.AppData });
          const parsed = JSON.parse(content) as LocalNoteRecord;
          if (parsed && parsed.date && validateIsoDate(parsed.date)) {
            records.push(parsed);
            seenDates.add(parsed.date);
            await saveNoteToDisk(parsed.date, parsed);
          }
        } catch {
          /* ignore */
        }
      }
    }

    return records;
  } catch (err) {
    console.warn("[localLogService] Failed to scan disk notes directory:", err);
    return [];
  }
}

export interface LocalNoteRecord {
  date: string;          // YYYY-MM-DD
  notes: string;         // plaintext (empty string when encrypted)
  sync_pending: boolean; // Flag to indicate backup to GDrive is pending
  updatedAt: number;     // Millisecond timestamp
  /** Layer 6: AES-256-GCM encrypted payload (present when encryption is active) */
  encrypted?: EncryptedPayload;
}

// ─── Internal Helpers ───────────────────────────────────────────

async function buildEncryptedRecord(
  date: string,
  content: string,
  syncPending: boolean,
  updatedAtMs?: number
): Promise<LocalNoteRecord> {
  await initEncryptionKey().catch(() => {});
  const cleanContent = sanitizeText(content);
  const payload = await encryptNote(cleanContent, getNoteAadContext(date));
  const timestamp = updatedAtMs || Date.now();

  if (payload) {
    return {
      date,
      notes: "",
      sync_pending: syncPending,
      updatedAt: timestamp,
      encrypted: payload,
    };
  }

  return {
    date,
    notes: cleanContent,
    sync_pending: syncPending,
    updatedAt: timestamp,
  };
}

async function readAndDecryptByDate(date: string): Promise<LocalNoteRecord | null> {
  if (!validateIsoDate(date)) return null;
  await initEncryptionKey().catch(() => {});

  const scopedKey = getScopedNoteKey(date);
  let raw: LocalNoteRecord | null | undefined = await get<LocalNoteRecord>(scopedKey);

  // Lazy migration from legacy unscoped note_record_YYYY-MM-DD
  if (!raw) {
    const legacyKey = `${LEGACY_NOTE_KEY_PREFIX}${date}`;
    const legacyRaw = await get<LocalNoteRecord>(legacyKey);
    if (legacyRaw) {
      raw = legacyRaw;
      await set(scopedKey, legacyRaw).catch(() => {});
      await del(legacyKey).catch(() => {});
    }
  }

  // Fallback to native OS disk ($APPDATA/notes/<uid>/)
  if (!raw && isTauri()) {
    raw = await readNoteFromDisk(date);
    if (raw) {
      await set(scopedKey, raw).catch(() => {});
    }
  }

  if (!raw) return null;

  if (isEncryptedRecord(raw)) {
    const plaintext = await decryptNote(raw.encrypted!, getNoteAadContext(date));
    if (plaintext !== null) {
      return { ...raw, notes: plaintext };
    }
    if (raw.notes && raw.notes.trim() !== "") {
      return raw;
    }
    console.warn(`[localLogService] Decryption failed for ${scopedKey}. Note is unrecoverable locally.`);
    return { ...raw, notes: "" };
  }

  if (raw.notes && raw.notes.trim() !== "") {
    reEncryptLegacyRecord(scopedKey, raw).catch(() => {});
  }

  return raw;
}

async function reEncryptLegacyRecord(
  key: string,
  record: LocalNoteRecord
): Promise<void> {
  const payload = await encryptNote(record.notes, getNoteAadContext(record.date));
  if (!payload) return;

  const updated: LocalNoteRecord = {
    ...record,
    notes: "",
    encrypted: payload,
  };
  await set(key, updated);
  saveNoteToDisk(record.date, updated).catch(() => {});
  console.info(`[localLogService] Re-encrypted legacy record: ${key}`);
}

// ─── Public API ──────────────────────────────────────────────────

export async function saveLocalNote(date: string, content: string): Promise<void> {
  if (!validateIsoDate(date)) {
    throw new Error(`Invalid note date format: "${date}"`);
  }
  const key = getScopedNoteKey(date);
  const record = await buildEncryptedRecord(date, content, true);

  await set(key, record);
  saveNoteToDisk(date, record).catch(() => {});

  try {
    const { updateInteractionDate } = await import("../../freeze/services/freezeService");
    updateInteractionDate(date).catch(() => {});
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("w:note-saved", {
        detail: { date, notes: content, sync_pending: true },
      })
    );
  }
}

export async function saveDownloadedNote(
  date: string,
  content: string,
  remoteModifiedTimeMs?: number
): Promise<void> {
  if (!validateIsoDate(date)) {
    throw new Error(`Invalid note date format: "${date}"`);
  }
  const key = getScopedNoteKey(date);
  const record = await buildEncryptedRecord(date, content, false, remoteModifiedTimeMs);

  await set(key, record);
  saveNoteToDisk(date, record).catch(() => {});

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("w:note-saved", {
        detail: { date, notes: content, sync_pending: false },
      })
    );
  }
}

export async function getLocalNote(date: string): Promise<string> {
  const record = await readAndDecryptByDate(date);
  return record ? record.notes : "";
}

export async function getLocalNoteRecord(date: string): Promise<LocalNoteRecord | null> {
  return readAndDecryptByDate(date);
}

async function getScopedAndMigratedRawRecords(): Promise<LocalNoteRecord[]> {
  const allKeys = await keys();
  const scopedPrefix = getScopedNotePrefix();
  const scopedKeys = allKeys.filter((k): k is string => typeof k === "string" && k.startsWith(scopedPrefix));
  const rawRecords: LocalNoteRecord[] = scopedKeys.length > 0
    ? (await getMany<LocalNoteRecord>(scopedKeys)).filter((r): r is LocalNoteRecord => Boolean(r))
    : [];

  // Migrate any legacy unscoped note_record_YYYY-MM-DD keys once
  const legacyKeys = allKeys.filter(
    (k): k is string => typeof k === "string" && LEGACY_NOTE_KEY_REGEX.test(k)
  );
  if (legacyKeys.length > 0) {
    const legacyRecords = await getMany<LocalNoteRecord>(legacyKeys);
    for (let i = 0; i < legacyKeys.length; i++) {
      const lKey = legacyKeys[i];
      const lRec = legacyRecords[i];
      const match = lKey.match(LEGACY_NOTE_KEY_REGEX);
      if (!lRec || !match) continue;
      const date = match[1];
      if (!rawRecords.some((r) => r.date === date)) {
        await set(getScopedNoteKey(date), lRec).catch(() => {});
        rawRecords.push(lRec);
      }
      await del(lKey).catch(() => {});
    }
  }

  return rawRecords;
}

export async function getPendingSyncNotes(): Promise<LocalNoteRecord[]> {
  const rawRecords = await getScopedAndMigratedRawRecords();
  if (rawRecords.length === 0) return [];

  const pending: LocalNoteRecord[] = [];
  for (const raw of rawRecords) {
    if (!raw || raw.sync_pending !== true) continue;

    if (isEncryptedRecord(raw)) {
      const plaintext = await decryptNote(raw.encrypted!, getNoteAadContext(raw.date));
      if (plaintext !== null) {
        pending.push({ ...raw, notes: plaintext });
      }
    } else {
      pending.push(raw);
    }
  }

  return pending;
}

export async function clearSyncPending(
  date: string,
  localStartTimestamp: number,
  serverModifiedTimeMs: number
): Promise<void> {
  if (!validateIsoDate(date)) return;
  const key = getScopedNoteKey(date);
  const record = await get<LocalNoteRecord>(key);
  if (record) {
    if (record.updatedAt > localStartTimestamp) {
      console.info(`[localLogService] Skipping clearSyncPending for ${date}: record was modified during sync.`);
      return;
    }
    record.sync_pending = false;
    record.updatedAt = serverModifiedTimeMs;
    await set(key, record);
    saveNoteToDisk(date, record).catch(() => {});

    let plaintext = record.notes;
    if (isEncryptedRecord(record)) {
      plaintext = (await decryptNote(record.encrypted!, getNoteAadContext(date))) ?? "";
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("w:note-saved", {
          detail: { date, notes: plaintext, sync_pending: false },
        })
      );
    }
  }
}

const SYSTEM_NOTE_PATTERNS = [
  /^\[\s*AUTO-FREEZE\s*\]$/i,
  /^\[\s*FROZEN\s*\]$/i,
  /^\[\s*SYSTEM\s*\]$/i,
];

function isSystemPlaceholder(notes: string): boolean {
  return SYSTEM_NOTE_PATTERNS.some((p) => p.test(notes.trim()));
}

export async function getLocalNoteHistory(): Promise<HabitLog[]> {
  await initEncryptionKey().catch(() => {});
  const rawRecords = await getScopedAndMigratedRawRecords();

  if (isTauri()) {
    try {
      const diskRecords = await readAllNotesFromDisk();
      for (const diskRecord of diskRecords) {
        if (!diskRecord || !diskRecord.date || !validateIsoDate(diskRecord.date)) continue;
        const existsInIdb = rawRecords.some((r) => r && r.date === diskRecord.date);
        if (!existsInIdb) {
          await set(getScopedNoteKey(diskRecord.date), diskRecord).catch(() => {});
          rawRecords.push(diskRecord);
        }
      }
      for (const r of rawRecords) {
        if (r && r.date && validateIsoDate(r.date)) {
          saveNoteToDisk(r.date, r).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("[localLogService] Disk notes reconciliation failed:", err);
    }
  }

  const decrypted: LocalNoteRecord[] = [];
  for (const raw of rawRecords) {
    if (!raw || !validateIsoDate(raw.date)) continue;

    if (isEncryptedRecord(raw)) {
      const plaintext = await decryptNote(raw.encrypted!, getNoteAadContext(raw.date));
      if (plaintext !== null && plaintext.trim() !== "" && !isSystemPlaceholder(plaintext)) {
        decrypted.push({ ...raw, notes: plaintext });
      } else if (raw.notes && raw.notes.trim() !== "" && !isSystemPlaceholder(raw.notes)) {
        decrypted.push(raw);
      }
    } else if (raw.notes && raw.notes.trim() !== "" && !isSystemPlaceholder(raw.notes)) {
      decrypted.push(raw);
    }
  }

  const userId = auth.currentUser?.uid || "local_user";

  try {
    const logsMap = await get<Record<string, any>>(`w_col_users/${userId}/logs`);
    if (logsMap) {
      for (const [date, logEntry] of Object.entries(logsMap)) {
        if (
          validateIsoDate(date) &&
          logEntry?.notes &&
          typeof logEntry.notes === "string" &&
          logEntry.notes.trim() !== "" &&
          !isSystemPlaceholder(logEntry.notes)
        ) {
          if (!decrypted.some((d) => d.date === date)) {
            decrypted.push({
              date,
              notes: logEntry.notes,
              sync_pending: false,
              updatedAt: logEntry.updatedAt || Date.now(),
            });
            saveDownloadedNote(date, logEntry.notes).catch(() => {});
          }
        }
      }
    }
  } catch (e) {
    console.warn("[localLogService] Could not check legacy logs map:", e);
  }

  const logs: HabitLog[] = decrypted.map((r) => ({
    date: r.date,
    uid: userId,
    notes: r.notes,
    habits: {},
    sync_pending: r.sync_pending,
  }));

  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

export async function flushAllNotesToDisk(): Promise<void> {
  if (!isTauri()) return;
  try {
    const records = await getScopedAndMigratedRawRecords();
    for (const r of records) {
      if (r && r.date && validateIsoDate(r.date)) {
        await saveNoteToDisk(r.date, r);
      }
    }
    console.info(`[localLogService] Successfully flushed ${records.length} notes to disk.`);
  } catch (err) {
    console.error("[localLogService] Failed to flush notes to disk:", err);
  }
}
