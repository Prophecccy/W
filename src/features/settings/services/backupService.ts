import { collection, getDocs } from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { getUserDoc } from "../../auth/services/userService";

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

  return {
    exportedAt: new Date().toISOString(),
    user: userDoc,
    habits,
    todos,
    logs,
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
    const { appDataDir } = await import("@tauri-apps/api/path");
    const { mkdir, writeTextFile, readDir, remove } = await import("@tauri-apps/plugin-fs");

    const baseDir = await appDataDir();
    const backupsDir = `${baseDir}backups`;

    // Ensure backups directory exists
    try {
      await mkdir(backupsDir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    const filePath = `${backupsDir}/${filename}`;
    await writeTextFile(filePath, json);

    // Enforce rolling limit of 4 backups
    await enforceRollingLimit(backupsDir, readDir, remove);

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
  remove: (path: string) => Promise<void>
): Promise<void> {
  try {
    const entries = await readDir(dirPath);
    const backupFiles = entries
      .filter((e: any) => e.name?.startsWith("backup_") && e.name?.endsWith(".json"))
      .sort((a: any, b: any) => (a.name > b.name ? 1 : -1));

    while (backupFiles.length > 4) {
      const oldest = backupFiles.shift();
      if (oldest?.name) {
        await remove(`${dirPath}/${oldest.name}`);
      }
    }
  } catch (err) {
    console.warn("Failed to enforce rolling backup limit:", err);
  }
}

// ─── Get last backup date ──────────────────────────────────────

export async function getLastBackupDate(): Promise<string | null> {
  try {
    const { appDataDir } = await import("@tauri-apps/api/path");
    const { readDir } = await import("@tauri-apps/plugin-fs");

    const baseDir = await appDataDir();
    const backupsDir = `${baseDir}backups`;

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
