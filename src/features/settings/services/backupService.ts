import { collection, getDocs, doc, setDoc, writeBatch } from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { getUserDoc } from "../../auth/services/userService";
import { getLocalNoteHistory, saveDownloadedNote } from "../../logs/services/localLogService";

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
  const userDoc = await getUserDoc(userId);
  const habits = await getAllCollectionData("habits");
  const todos = await getAllCollectionData("todos");
  const logs = await getAllCollectionData("logs");
  const groups = await getAllCollectionData("groups");
  const stickyNotes = await getAllCollectionData("sticky-notes");
  const dailyNotes = await getLocalNoteHistory();

  return {
    exportedAt: new Date().toISOString(),
    user: userDoc,
    habits,
    todos,
    logs,
    groups,
    "sticky-notes": stickyNotes,
    dailyNotes,
  };
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
  
  if (!data || typeof data !== "object") {
    throw new Error("Invalid backup data format");
  }

  // 1. Restore User Settings Document
  if (data.user) {
    const userRef = doc(db, "users", userId);
    const restoredUser = { ...data.user, uid: userId };
    await setDoc(userRef, restoredUser);
  }

  // Helper to batch restore a collection
  async function restoreCollection(collectionName: string, items: any[]) {
    if (!items || !Array.isArray(items)) return;
    let batch = writeBatch(db);
    let count = 0;
    
    for (const item of items) {
      if (!item.id) continue;
      const docRef = doc(db, "users", userId, collectionName, item.id);
      
      const { id, ...docData } = item;
      
      // SECURITY: Ensure notes are NEVER written to Firestore logs collection
      if (collectionName === "logs" && docData.notes) {
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

  // 2. Restore Firestore collections
  await restoreCollection("habits", data.habits);
  await restoreCollection("todos", data.todos);
  await restoreCollection("logs", data.logs);
  await restoreCollection("groups", data.groups);
  await restoreCollection("sticky-notes", data["sticky-notes"]);

  // 3. Restore Local Daily Notes to IndexedDB
  if (data.dailyNotes && Array.isArray(data.dailyNotes)) {
    for (const note of data.dailyNotes) {
      if (note.date && note.notes) {
        await saveDownloadedNote(note.date, note.notes);
      }
    }
  }
}
