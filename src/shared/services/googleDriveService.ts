import { getPendingSyncNotes, clearSyncPending } from "../../features/logs/services/localLogService";
import { getToday, getMsUntilReset } from "../utils/dateUtils";


const REFRESH_TOKEN_KEY = "w_gdrive_refresh_token";
const ACCESS_TOKEN_KEY = "w_gdrive_access_token";
const EXPIRES_AT_KEY = "w_gdrive_expires_at";

export interface GDriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Saves the OAuth tokens to local storage.
 */
export function saveOAuthTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
  const expiresAt = Date.now() + expiresIn * 1000;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(EXPIRES_AT_KEY, expiresAt.toString());
  localStorage.setItem("driveLinked", "true");
  console.info("[GDrive Service] OAuth tokens securely cached locally.");
  window.dispatchEvent(new CustomEvent("w:gdrive-linked"));
}

/**
 * Checks if the user is authenticated with Google Drive.
 */
export function isDriveAuthenticated(): boolean {
  return localStorage.getItem("driveLinked") === "true" || !!localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Clear cached Google Drive credentials (e.g. on logout).
 */
export function clearOAuthTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  localStorage.setItem("driveLinked", "false");
  console.info("[GDrive Service] Cached tokens cleared.");
  window.dispatchEvent(new CustomEvent("w:gdrive-unlinked"));
}

/**
 * Retrieves a valid, unexpired access token. Automatically refreshes it if needed.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    console.warn("[GDrive Service] No refresh token found. User is not authenticated for backup.");
    return null;
  }

  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const expiresAtStr = localStorage.getItem(EXPIRES_AT_KEY);
  const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;

  // If token is valid for at least 60 seconds, return it
  if (accessToken && expiresAt > Date.now() + 60000) {
    return accessToken;
  }

  console.info("[GDrive Service] Access token expired or missing. Refreshing...");

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("[GDrive Service] VITE_GOOGLE_CLIENT_ID environment variable is missing.");
    return null;
  }

  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
  if (!clientSecret) {
    console.error("[GDrive Service] VITE_GOOGLE_CLIENT_SECRET environment variable is missing.");
    return null;
  }
  const refreshParams: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(refreshParams),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GDrive Service] Token refresh failed: ${response.status}`, errorText);
      
      // If the refresh token is revoked/invalid, clear it to prompt re-login
      if (response.status === 400 || response.status === 401) {
        clearOAuthTokens();
      }
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const newExpiresIn = data.expires_in || 3600;
    const newExpiresAt = Date.now() + newExpiresIn * 1000;

    localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken);
    localStorage.setItem(EXPIRES_AT_KEY, newExpiresAt.toString());
    
    if (data.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    }

    console.info("[GDrive Service] Access token refreshed successfully.");
    return newAccessToken;
  } catch (err) {
    console.error("[GDrive Service] Network error during token refresh:", err);
    return null;
  }
}

/**
 * Searches for a folder by name inside a parent directory.
 * If parentId is not provided, searches in 'root'.
 */
async function findFolder(accessToken: string, folderName: string, parentId?: string): Promise<string | null> {
  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to find folder: ${res.statusText}`);
  }

  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

/**
 * Creates a folder with the specified name inside a parent folder.
 */
async function createFolder(accessToken: string, folderName: string, parentId?: string): Promise<string> {
  const url = "https://www.googleapis.com/drive/v3/files";
  const body: { name: string; mimeType: string; parents?: string[] } = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };

  if (parentId) {
    body.parents = [parentId];
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to create folder: ${res.statusText}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Searches for a file named fileName inside a parent folder.
 */
async function findFile(accessToken: string, fileName: string, parentId: string): Promise<string | null> {
  const query = `name = '${fileName}' and '${parentId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to find file: ${res.statusText}`);
  }

  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

/**
 * Creates a blank metadata-only file on Google Drive inside a parent folder.
 */
async function createEmptyFile(accessToken: string, fileName: string, parentId: string): Promise<string> {
  const url = "https://www.googleapis.com/drive/v3/files";
  const body = {
    name: fileName,
    parents: [parentId],
    mimeType: "text/markdown",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to create metadata file: ${res.statusText}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Uploads/Overwrites the content of a file using standard media upload.
 */
async function uploadFileContent(accessToken: string, fileId: string, content: string): Promise<void> {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "text/markdown",
    },
    body: content,
  });

  if (!res.ok) {
    throw new Error(`Failed to upload file content: ${res.statusText}`);
  }
}

/**
 * Syncs a single note to Google Drive under W_Logbook/[Year]/[Date].md structure.
 */
export async function syncNoteToDrive(accessToken: string, dateStr: string, content: string): Promise<void> {
  // Extract year from dateStr (format YYYY-MM-DD)
  const year = dateStr.substring(0, 4);
  const fileName = `${dateStr}.md`;

  console.info(`[GDrive Service] Syncing note for ${dateStr} to W_Logbook/${year}/${fileName}...`);

  // 1. Locate or create root 'W_Logbook' folder
  let rootFolderId = await findFolder(accessToken, "W_Logbook");
  if (!rootFolderId) {
    console.info("[GDrive Service] 'W_Logbook' folder not found. Creating...");
    rootFolderId = await createFolder(accessToken, "W_Logbook");
  }

  // 2. Locate or create Year subfolder
  let yearFolderId = await findFolder(accessToken, year, rootFolderId);
  if (!yearFolderId) {
    console.info(`[GDrive Service] Year folder '${year}' not found. Creating...`);
    yearFolderId = await createFolder(accessToken, year, rootFolderId);
  }

  // 3. Search for existing Date.md file
  let fileId = await findFile(accessToken, fileName, yearFolderId);

  if (!fileId) {
    console.info(`[GDrive Service] File '${fileName}' does not exist. Creating new...`);
    fileId = await createEmptyFile(accessToken, fileName, yearFolderId);
  }

  // 4. Overwrite raw file media contents
  await uploadFileContent(accessToken, fileId, content);
  console.info(`[GDrive Service] Successfully sync'd ${fileName} to Drive.`);
}

let isSyncRunning = false;

/**
 * Scans local-first IndexedDB for sync_pending notes and uploads them to Google Drive.
 * Exits quietly if the user is not authenticated or offline.
 */
export async function runBackgroundSync(): Promise<void> {
  if (isSyncRunning) {
    console.info("[GDrive Service] Sync is already running. Skipping trigger.");
    return;
  }

  if (!navigator.onLine) {
    console.info("[GDrive Service] Network offline. Postponing sync.");
    return;
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    console.info("[GDrive Service] Skipping sync: User not authenticated with Google Drive.");
    return;
  }

  isSyncRunning = true;
  console.info("[GDrive Service] Background sync worker started.");

  try {
    const pendingNotes = await getPendingSyncNotes();
    if (pendingNotes.length === 0) {
      console.info("[GDrive Service] No pending sync items found.");
      return;
    }

    console.info(`[GDrive Service] Found ${pendingNotes.length} notes pending sync.`);

    const resetTime = localStorage.getItem("w_daily_reset_time") || "04:00";
    const today = getToday(undefined, resetTime);
    const msUntilReset = getMsUntilReset(resetTime, new Date());
    const isInBackupWindow = msUntilReset <= 5 * 60 * 1000;

    // Sync notes sequentially to avoid race conditions or folder creation duplication
    for (const note of pendingNotes) {
      if (note.date === today && !isInBackupWindow) {
        console.info(`[GDrive Service] Deferring sync of today's note (${note.date}) until 5 mins before daily reset (current ms until reset: ${msUntilReset}).`);
        continue;
      }

      try {
        await syncNoteToDrive(accessToken, note.date, note.notes);
        await clearSyncPending(note.date);
        
        // Dispatch global notification for UI indicators

        window.dispatchEvent(new CustomEvent("w:note-synced", { detail: note.date }));
      } catch (err) {
        console.error(`[GDrive Service] Failed to sync note for date ${note.date}:`, err);
        // Continue to next note in case one is corrupted, leaving this one flagged pending
      }
    }
  } catch (err) {
    console.error("[GDrive Service] Error in background sync lifecycle:", err);
  } finally {
    isSyncRunning = false;
    console.info("[GDrive Service] Background sync worker completed cycle.");
  }
}
