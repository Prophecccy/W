import { db, auth, collection, getDocs, doc, setDoc, writeBatch } from "../../../shared/config/firebase";
import { validateDocumentPayload } from "../../../shared/services/localDb";
import { computePayloadSha256, sanitizeStrikesShape, verifyPayloadSha256 } from "../../../shared/utils/integrity";
import { validateIsoDate } from "../../../shared/utils/security";
import { getUserDoc } from "../../auth/services/userService";
import { getLocalNoteHistory, saveDownloadedNote } from "../../logs/services/localLogService";

const SAFE_DOC_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

function sanitizeExportedUser(userDoc: any): any {
  if (!userDoc || typeof userDoc !== "object") return userDoc;
  const clone = { ...userDoc };
  if (clone.settings && typeof clone.settings === "object") {
    const { groqApiKey: _stripped, ...safeSettings } = clone.settings;
    clone.settings = safeSettings;
  }
  return clone;
}

// ─── Helpers ────────────────────────────────────────────────────

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}

async function getAllCollectionData(collectionName: string): Promise<Record<string, unknown>[]> {
  const ref = collection(db, "users", uid(), collectionName);
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Gather all user data ──────────────────────────────────────

async function gatherAllData(): Promise<Record<string, unknown>> {
  const userId = uid();
  const userDoc = sanitizeExportedUser(await getUserDoc(userId));
  const habits = await getAllCollectionData("habits");
  const todos = await getAllCollectionData("todos");
  const logs = await getAllCollectionData("logs");
  const groups = await getAllCollectionData("groups");
  const stickyNotes = await getAllCollectionData("sticky-notes");
  const dailyNotes = await getLocalNoteHistory();

  const unsigned = {
    exportedAt: new Date().toISOString(),
    user: userDoc,
    habits,
    todos,
    logs,
    groups,
    "sticky-notes": stickyNotes,
    dailyNotes,
  };
  const integritySha256 = await computePayloadSha256(unsigned);
  return { ...unsigned, integritySha256 };
}

// ─── Create Backup (Tauri FS) ────────────────────────────────────

export async function createBackup(): Promise<string> {
  const data = await gatherAllData();
  const json = JSON.stringify(data, null, 2);

  const now = new Date();
  const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const filename = `backup_${datePart}.json`;

  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const { mkdir, writeTextFile, readDir, remove } = await import("@tauri-apps/plugin-fs");

    const baseDir = await appDataDir();
    const backupsDir = await join(baseDir, "backups");

    // Ensure backups directory exists
    try {
      await mkdir(backupsDir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    const filePath = await join(backupsDir, filename);
    await writeTextFile(filePath, json);

    // Enforce rolling limit of 4 backups
    await enforceRollingLimit(backupsDir, readDir, remove, join);

    return filePath;
  } catch (err) {
    console.warn("Tauri FS unavailable, falling back to browser download:", err);
    // Fallback: trigger browser download
    triggerDownload(json, filename, "application/json");
    return filename;
  }
}

// ─── Rolling limit ──────────────────────────────────────────────

async function enforceRollingLimit(
  dirPath: string,
  readDir: (path: string) => Promise<any[]>,
  remove: (path: string) => Promise<void>,
  join: (...paths: string[]) => Promise<string>
): Promise<void> {
  try {
    const entries = await readDir(dirPath);
    const backupFiles = entries
      .filter((e: any) => e.name?.startsWith("backup_") && e.name?.endsWith(".json"))
      .sort((a: any, b: any) => (a.name > b.name ? 1 : -1));

    while (backupFiles.length > 4) {
      const oldest = backupFiles.shift();
      if (oldest?.name) {
        const fileToRemove = await join(dirPath, oldest.name);
        await remove(fileToRemove);
      }
    }
  } catch (err) {
    console.warn("Failed to enforce rolling backup limit:", err);
  }
}

// ─── Get last backup date ──────────────────────────────────────

export async function getLastBackupDate(): Promise<string | null> {
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const { readDir } = await import("@tauri-apps/plugin-fs");

    const baseDir = await appDataDir();
    const backupsDir = await join(baseDir, "backups");

    const entries = await readDir(backupsDir);
    const backupFiles = entries
      .filter((e: any) => e.name?.startsWith("backup_") && e.name?.endsWith(".json"))
      .sort((a: any, b: any) => (a.name > b.name ? -1 : 1));

    if (backupFiles.length === 0) return null;

    // Parse date from filename: backup_YYYY-MM-DD_HHmm.json
    const match = backupFiles[0].name?.match(/backup_(\d{4}-\d{2}-\d{2})_(\d{4})\.json/);
    if (match) {
      return match[1]; // YYYY-MM-DD
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Check if auto-backup needed (>7 days since last) ────────

export async function checkAutoBackup(): Promise<void> {
  try {
    const { isTauri } = await import("../../../shared/utils/tauri");
    if (!isTauri()) return;

    const lastDate = await getLastBackupDate();
    if (!lastDate) {
      // No backups ever — create one
      await createBackup();
      return;
    }
    const last = new Date(lastDate + "T12:00:00");
    const now = new Date();
    const daysSince = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= 7) {
      await createBackup();
    }
  } catch (err) {
    console.warn("Auto-backup check failed:", err);
  }
}

// ─── Browser download fallback ──────────────────────────────────

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Restore Backup ──────────────────────────────────────────────

export async function restoreBackup(data: any): Promise<void> {
  const userId = uid();
  const MAX_ITEMS_PER_COLLECTION = 10_000;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid backup data format");
  }

  // OWASP A08: Verify cryptographic SHA-256 backup digest when present
  if ("integritySha256" in data && data.integritySha256 !== undefined) {
    const { integritySha256, ...unsignedData } = data as Record<string, unknown>;
    const valid = await verifyPayloadSha256(unsignedData, String(integritySha256));
    if (!valid) {
      throw new Error("Backup integrity verification failed: file may be corrupted or modified.");
    }
  }

  // 1. Restore User Settings Document with strict field allowlist & active UID pinning
  if (data.user && typeof data.user === "object" && !Array.isArray(data.user)) {
    const userRef = doc(db, "users", userId);
    const allowedUserFields = [
      "settings",
      "aesthetics",
      "wallpapers",
      "strikes",
      "freeze",
      "lockdown",
      "lastActiveDate",
      "hasOnboarded",
      "createdAt",
    ] as const;

    const pickedUser: Record<string, unknown> = {
      uid: userId,
      email: auth.currentUser?.email ?? null,
    };

    for (const field of allowedUserFields) {
      if (data.user[field] !== undefined) {
        pickedUser[field] = data.user[field];
      }
    }

    if (pickedUser.settings && typeof pickedUser.settings === "object" && !Array.isArray(pickedUser.settings)) {
      const { groqApiKey: _stripped, ...safeSettings } = pickedUser.settings as Record<string, unknown>;
      pickedUser.settings = safeSettings;
    }

    const boundedStrikes = sanitizeStrikesShape(pickedUser.strikes);
    if (boundedStrikes) {
      pickedUser.strikes = boundedStrikes;
    }

    const sanitizedUser = validateDocumentPayload(pickedUser, `users/${userId}`);
    await setDoc(userRef, sanitizedUser);
  }

  // Helper to batch restore a collection safely
  async function restoreCollection(collectionName: string, items: any[]) {
    if (!items || !Array.isArray(items)) return;
    let batch = writeBatch(db);
    let count = 0;

    for (const item of items.slice(0, MAX_ITEMS_PER_COLLECTION)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      if (typeof item.id !== "string" || !SAFE_DOC_ID_REGEX.test(item.id)) continue;

      const docPath = `users/${userId}/${collectionName}/${item.id}`;
      const docRef = doc(db, "users", userId, collectionName, item.id);

      const { id: _id, ...rawDocData } = item;
      const docData = validateDocumentPayload<Record<string, unknown>>(rawDocData, docPath);
      docData.uid = userId;

      // SECURITY: Ensure notes are NEVER written to logs collection
      if (collectionName === "logs" && "notes" in docData) {
        delete docData.notes;
      }

      batch.set(docRef, docData, { merge: true });
      count++;

      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }
  }

  // 2. Restore collections
  await restoreCollection("habits", data.habits);
  await restoreCollection("todos", data.todos);
  await restoreCollection("logs", data.logs);
  await restoreCollection("groups", data.groups);
  await restoreCollection("sticky-notes", data["sticky-notes"]);

  // 3. Restore Local Daily Notes to IndexedDB (only valid ISO calendar dates)
  if (data.dailyNotes && Array.isArray(data.dailyNotes)) {
    for (const note of data.dailyNotes) {
      if (note && validateIsoDate(note.date) && typeof note.notes === "string") {
        await saveDownloadedNote(note.date, note.notes);
      }
    }
  }
}
