import {
  getPendingSyncNotes,
  clearSyncPending,
  getLocalNoteRecord,
  saveDownloadedNote
} from "../../features/logs/services/localLogService";
import { getToday } from "../utils/dateUtils";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { isTauri } from "../utils/tauri";

const REFRESH_TOKEN_KEY = "w_gdrive_refresh_token";
const ACCESS_TOKEN_KEY = "w_gdrive_access_token";
const EXPIRES_AT_KEY = "w_gdrive_expires_at";
const FOLDER_CACHE_KEY = "w_gdrive_folder_cache";
const TOKENS_FILE = "gdrive_session.json";

export interface GDriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface GDriveFolderCache {
  rootFolderId: string | null;
  yearFolderIds: Record<string, string>;
}

interface OAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let cachedSession: OAuthSession | null = null;
let isSessionInitialized = false;

// Helper to asynchronously initialize the session cache from file or localStorage
async function ensureSessionInitialized(): Promise<void> {
  if (isSessionInitialized) return;

  if (isTauri()) {
    try {
      const { exists, readTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      if (await exists(TOKENS_FILE, { baseDir: BaseDirectory.AppData })) {
        const contents = await readTextFile(TOKENS_FILE, { baseDir: BaseDirectory.AppData });
        cachedSession = JSON.parse(contents) as OAuthSession;
        console.info("[GDrive Service] OAuth session loaded from AppData secure storage.");
      }
    } catch (e) {
      console.error("[GDrive Service] Failed to load OAuth session from AppData:", e);
    }
  } else {
    try {
      const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      const expiresAtStr = localStorage.getItem(EXPIRES_AT_KEY);
      if (accessToken && refreshToken && expiresAtStr) {
        cachedSession = {
          accessToken,
          refreshToken,
          expiresAt: parseInt(expiresAtStr, 10),
        };
        console.info("[GDrive Service] OAuth session loaded from localStorage fallback.");
      }
    } catch (e) {
      console.error("[GDrive Service] Failed to load OAuth session from localStorage:", e);
    }
  }

  isSessionInitialized = true;
}

async function getOAuthSession(): Promise<OAuthSession | null> {
  await ensureSessionInitialized();
  return cachedSession;
}

async function getFolderCache(): Promise<GDriveFolderCache> {
  try {
    const cached = await idbGet<GDriveFolderCache>(FOLDER_CACHE_KEY);
    return cached || { rootFolderId: null, yearFolderIds: {} };
  } catch {
    return { rootFolderId: null, yearFolderIds: {} };
  }
}

async function saveFolderCache(cache: GDriveFolderCache): Promise<void> {
  try {
    await idbSet(FOLDER_CACHE_KEY, cache);
  } catch (err) {
    console.error("Failed to save folder cache:", err);
  }
}

async function clearFolderCache(): Promise<void> {
  try {
    await idbSet(FOLDER_CACHE_KEY, { rootFolderId: null, yearFolderIds: {} });
  } catch (err) {
    console.error("Failed to clear folder cache:", err);
  }
}

/**
 * Saves the OAuth tokens securely.
 */
export async function saveOAuthTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
  const expiresAt = Date.now() + expiresIn * 1000;
  
  const existingSession = await getOAuthSession();
  const finalRefreshToken = refreshToken || existingSession?.refreshToken || "";

  cachedSession = {
    accessToken,
    refreshToken: finalRefreshToken,
    expiresAt,
  };
  isSessionInitialized = true;

  localStorage.setItem("driveLinked", "true");

  if (isTauri()) {
    try {
      const { writeTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(TOKENS_FILE, JSON.stringify(cachedSession), { baseDir: BaseDirectory.AppData });
      console.info("[GDrive Service] OAuth session saved to AppData.");
    } catch (e) {
      console.error("[GDrive Service] Failed to save OAuth session to AppData:", e);
    }
  } else {
    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, finalRefreshToken);
      localStorage.setItem(EXPIRES_AT_KEY, expiresAt.toString());
      console.info("[GDrive Service] OAuth session saved to localStorage fallback.");
    } catch (e) {
      console.error("[GDrive Service] Failed to save OAuth session to localStorage:", e);
    }
  }

  window.dispatchEvent(new CustomEvent("w:gdrive-linked"));
}

/**
 * Checks if the user is authenticated with Google Drive.
 */
export function isDriveAuthenticated(): boolean {
  return localStorage.getItem("driveLinked") === "true";
}

/**
 * Clear cached Google Drive credentials (e.g. on logout).
 */
export async function clearOAuthTokens(): Promise<void> {
  cachedSession = null;
  isSessionInitialized = true;
  localStorage.setItem("driveLinked", "false");

  if (isTauri()) {
    try {
      const { exists, remove, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      if (await exists(TOKENS_FILE, { baseDir: BaseDirectory.AppData })) {
        await remove(TOKENS_FILE, { baseDir: BaseDirectory.AppData });
      }
      console.info("[GDrive Service] OAuth session file deleted from AppData.");
    } catch (e) {
      console.error("[GDrive Service] Failed to delete OAuth session file:", e);
    }
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    console.info("[GDrive Service] OAuth session removed from localStorage fallback.");
  }

  await clearFolderCache();
  window.dispatchEvent(new CustomEvent("w:gdrive-unlinked"));
}

function isValidTokenString(token: unknown): boolean {
  if (typeof token !== "string") return false;
  const t = token.trim();
  return t.length >= 10 && t.length <= 4096 && /^[A-Za-z0-9\-_.~+/=]+$/.test(t);
}

/**
 * Retrieves a valid, unexpired access token. Automatically refreshes it if needed.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const session = await getOAuthSession();
  const accessToken = session?.accessToken;
  const expiresAt = session?.expiresAt || 0;

  // If token is valid and structurally sound for at least 60 seconds, return it immediately
  if (accessToken && isValidTokenString(accessToken) && expiresAt > Date.now() + 60000) {
    return accessToken;
  }

  // Otherwise, we need a refresh token to request a new access token
  const refreshToken = session?.refreshToken;
  if (!refreshToken || !isValidTokenString(refreshToken)) {
    console.warn("[GDrive Service] Access token is expired/missing and no refresh token found.");
    // Only automatically clear the OAuth state if running on Tauri desktop app.
    // On web, since client-side popup does not provide a refresh token, we allow 
    // the user to remain linked so they are not blocked by the GDriveLockout page.
    if (isDriveAuthenticated() && isTauri()) {
      console.warn("[GDrive Service] Session is marked as authenticated but session file/token is missing. Clearing OAuth state.");
      await clearOAuthTokens();
    }
    return null;
  }

  console.info("[GDrive Service] Access token expired or missing. Refreshing...");

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("[GDrive Service] VITE_GOOGLE_CLIENT_ID environment variable is missing.");
    return null;
  }

  // Pure public client PKCE refresh — client secret is optional and not checked/required
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
  if (!clientSecret) {
    console.info("[GDrive Service] VITE_GOOGLE_CLIENT_SECRET is missing. Running public client token refresh.");
  }

  const refreshParams: Record<string, string> = {
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };

  if (clientSecret) {
    refreshParams.client_secret = clientSecret;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(refreshParams),
    });

    if (!response.ok) {
      let isInvalidGrant = false;
      try {
        const errorText = await response.text();
        console.error(`[GDrive Service] Token refresh failed: ${response.status}`, errorText);
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error === "invalid_grant") {
            isInvalidGrant = true;
          }
        } catch {
          if (errorText.includes("invalid_grant")) {
            isInvalidGrant = true;
          }
        }
      } catch (e) {
        console.error("[GDrive Service] Failed to read token refresh error response:", e);
      }

      if (isInvalidGrant) {
        await clearOAuthTokens();
      }
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const newExpiresIn = data.expires_in || 3600;

    await saveOAuthTokens(newAccessToken, data.refresh_token || refreshToken, newExpiresIn);

    console.info("[GDrive Service] Access token refreshed successfully.");
    return newAccessToken;
  } catch (err) {
    console.error("[GDrive Service] Network error during token refresh:", err);
    return null;
  }
}

/**
 * Safe fetch wrapper with exponential backoff and jitter for Google Drive API requests.
 * Automatically retries on HTTP 429 (Rate Limit / Too Many Requests) and 5xx errors.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let attempt = 0;
  let delay = 1000;

  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        attempt++;
        if (attempt >= maxRetries) return response;
        const jitter = Math.random() * 250;
        console.warn(`[GDrive Rate/Server Guard] Status ${response.status}. Retrying attempt ${attempt}/${maxRetries} in ${Math.round(delay + jitter)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        delay *= 2;
        continue;
      }
      return response;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  return fetch(url, options);
}

interface GDriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  mimeType?: string;
}

/**
 * Lists all files matching a query, recursively handling pagination using nextPageToken.
 */
async function listGoogleDriveFiles(
  accessToken: string,
  query: string,
  fields: string = "id,name"
): Promise<GDriveFile[]> {
  let allFiles: GDriveFile[] = [];
  let nextPageToken: string | null = null;

  do {
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(${fields})`;
    if (nextPageToken) {
      url += `&pageToken=${encodeURIComponent(nextPageToken)}`;
    }

    const res = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to list files: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.files) {
      allFiles = allFiles.concat(data.files);
    }
    nextPageToken = data.nextPageToken || null;
  } while (nextPageToken);

  return allFiles;
}

/**
 * Deletes a file or folder on Google Drive.
 */
async function deleteFileOrFolder(accessToken: string, fileId: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await fetchWithRetry(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.warn(`[GDrive Service] Failed to delete file/folder ${fileId}: ${res.statusText}`);
  }
}

/**
 * Merges files and folders from a duplicate source folder into a target folder.
 */
async function mergeFolders(accessToken: string, sourceFolderId: string, targetFolderId: string): Promise<void> {
  const query = `'${sourceFolderId}' in parents and trashed = false`;
  const items = await listGoogleDriveFiles(accessToken, query, "id,name,mimeType,modifiedTime");

  for (const item of items) {
    const targetQuery = `'${targetFolderId}' in parents and name = '${item.name}' and trashed = false`;
    const targetUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(targetQuery)}&fields=files(id,name,mimeType,modifiedTime)`;
    const targetRes = await fetch(targetUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    let targetItem: GDriveFile | null = null;
    if (targetRes.ok) {
      const data = await targetRes.json();
      if (data.files && data.files.length > 0) {
        targetItem = data.files[0];
      }
    }

    if (targetItem) {
      if (item.mimeType === "application/vnd.google-apps.folder" && targetItem.mimeType === "application/vnd.google-apps.folder") {
        await mergeFolders(accessToken, item.id, targetItem.id);
      } else {
        const sourceTime = item.modifiedTime ? new Date(item.modifiedTime).getTime() : 0;
        const targetTime = targetItem.modifiedTime ? new Date(targetItem.modifiedTime).getTime() : 0;

        if (sourceTime > targetTime) {
          const moveUrl = `https://www.googleapis.com/drive/v3/files/${item.id}?addParents=${targetFolderId}&removeParents=${sourceFolderId}`;
          const moveRes = await fetch(moveUrl, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (moveRes.ok) {
            await deleteFileOrFolder(accessToken, targetItem.id);
          }
        } else {
          await deleteFileOrFolder(accessToken, item.id);
        }
      }
    } else {
      const moveUrl = `https://www.googleapis.com/drive/v3/files/${item.id}?addParents=${targetFolderId}&removeParents=${sourceFolderId}`;
      await fetch(moveUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  }

  await deleteFileOrFolder(accessToken, sourceFolderId);
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

  const files = await listGoogleDriveFiles(accessToken, query, "id");
  return files.length > 0 ? files[0].id : null;
}

/**
 * Resolves duplicate W_Logbook folders in root and consolidates them into the oldest folder.
 */
async function resolveAndConsolidateRootFolder(accessToken: string): Promise<string> {
  const query = `name = 'W_Logbook' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime&fields=files(id,name,createdTime)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to query W_Logbook folders: ${res.statusText}`);
  }
  const data = await res.json();
  const folders = data.files || [];
  if (folders.length === 0) {
    console.info("[GDrive Service] No W_Logbook folder found. Creating...");
    return await createFolder(accessToken, "W_Logbook");
  }
  const oldestFolderId = folders[0].id;
  if (folders.length > 1) {
    console.warn(`[GDrive Service] Found ${folders.length} duplicate W_Logbook folders. Consolidating...`);
    for (let i = 1; i < folders.length; i++) {
      try {
        await mergeFolders(accessToken, folders[i].id, oldestFolderId);
      } catch (err) {
        console.error(`[GDrive Service] Failed to merge duplicate folder ${folders[i].id}:`, err);
      }
    }
    console.info("[GDrive Service] Consolidating complete.");
  }
  return oldestFolderId;
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

  const res = await fetchWithRetry(url, {
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
  const files = await listGoogleDriveFiles(accessToken, query, "id");
  return files.length > 0 ? files[0].id : null;
}

/**
 * Creates a blank metadata-only file on Google Drive inside a parent folder.
 */
async function createEmptyFile(accessToken: string, fileName: string, parentId: string): Promise<string> {
  const url = "https://www.googleapis.com/drive/v3/files";
  const body = {
    name: fileName,
    parents: [parentId],
    mimeType: fileName.endsWith(".json") ? "application/json" : "text/markdown",
  };

  const res = await fetchWithRetry(url, {
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
 * Returns the server modifiedTime of the uploaded file.
 */
async function uploadFileContent(
  accessToken: string,
  fileId: string,
  content: string,
  mimeType: string = "text/markdown"
): Promise<string> {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=modifiedTime`;
  
  const res = await fetchWithRetry(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": mimeType,
    },
    body: content,
  });

  if (!res.ok) {
    throw new Error(`Failed to upload file content: ${res.statusText}`);
  }

  const data = await res.json();
  return data.modifiedTime;
}

/**
 * Uploads consolidated W_state.json to Google Drive.
 */
export async function uploadStateToDrive(accessToken: string, content: string): Promise<string> {
  const fileName = "W_state.json";
  try {
    const rootFolderId = await resolveAndConsolidateRootFolder(accessToken);
    let fileId = await findFile(accessToken, fileName, rootFolderId);
    if (!fileId) {
      console.info("[GDrive Service] W_state.json does not exist on Drive. Creating new...");
      fileId = await createEmptyFile(accessToken, fileName, rootFolderId);
    }
    const modifiedTime = await uploadFileContent(accessToken, fileId, content, "application/json");
    console.info("[GDrive Service] Successfully uploaded W_state.json to Drive.");
    return modifiedTime;
  } catch (err) {
    console.error("[GDrive Service] W_state.json upload failed:", err);
    throw err;
  }
}

/**
 * Downloads consolidated W_state.json from Google Drive.
 * Returns file content string or null if not found.
 */
export async function downloadStateFromDrive(accessToken: string): Promise<{ content: string; modifiedTime: string } | null> {
  const fileName = "W_state.json";
  try {
    const rootFolderId = await resolveAndConsolidateRootFolder(accessToken);
    const fileId = await findFile(accessToken, fileName, rootFolderId);
    if (!fileId) {
      console.info("[GDrive Service] W_state.json not found on Drive.");
      return null;
    }
    
    // Download file content
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to download W_state.json: ${res.statusText}`);
    }
    const content = await res.text();
    
    // Get file metadata to get modifiedTime
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime`;
    const metaRes = await fetchWithRetry(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    let modifiedTime = "";
    if (metaRes.ok) {
      const meta = await metaRes.json();
      modifiedTime = meta.modifiedTime;
    }
    
    return { content, modifiedTime };
  } catch (err) {
    console.error("[GDrive Service] W_state.json download failed:", err);
    return null;
  }
}

/**
 * Syncs a single note to Google Drive under W_Logbook/[Year]/[Date].md structure.
 * Returns the server modifiedTime string.
 */
export async function syncNoteToDrive(accessToken: string, dateStr: string, content: string): Promise<string> {
  const year = dateStr.substring(0, 4);
  const fileName = `${dateStr}.md`;

  console.info(`[GDrive Service] Syncing note for ${dateStr} to W_Logbook/${year}/${fileName}...`);

  try {
    const cache = await getFolderCache();

    // 1. Locate or create root 'W_Logbook' folder
    let rootFolderId = cache.rootFolderId;
    if (!rootFolderId) {
      rootFolderId = await resolveAndConsolidateRootFolder(accessToken);
      cache.rootFolderId = rootFolderId;
      await saveFolderCache(cache);
    }

    // 2. Locate or create Year subfolder
    let yearFolderId = cache.yearFolderIds[year];
    if (!yearFolderId) {
      const found = await findFolder(accessToken, year, rootFolderId);
      if (found) {
        yearFolderId = found;
      } else {
        console.info(`[GDrive Service] Year folder '${year}' not found. Creating...`);
        yearFolderId = await createFolder(accessToken, year, rootFolderId);
      }
      cache.yearFolderIds[year] = yearFolderId;
      await saveFolderCache(cache);
    }

    // 3. Search for existing Date.md file
    let fileId = await findFile(accessToken, fileName, yearFolderId);

    if (!fileId) {
      console.info(`[GDrive Service] File '${fileName}' does not exist. Creating new...`);
      fileId = await createEmptyFile(accessToken, fileName, yearFolderId);
    }

    // 4. Overwrite raw file media contents and get server modified time
    const modifiedTime = await uploadFileContent(accessToken, fileId, content, "text/markdown");
    console.info(`[GDrive Service] Successfully sync'd ${fileName} to Drive.`);
    return modifiedTime;
  } catch (err) {
    console.error("[GDrive Service] Note sync failed, clearing folder ID cache:", err);
    await clearFolderCache();
    throw err;
  }
}

/**
 * Lists all Year subfolders and downloads missing daily note .md files from Google Drive W_Logbook.
 */
export async function pullNotesFromDrive(accessToken: string): Promise<void> {
  try {
    console.info("[GDrive Service] Starting historical daily notes sync-down from Google Drive...");
    
    // 1. Locate root folder
    let rootFolderId = await resolveAndConsolidateRootFolder(accessToken);

    const cache = await getFolderCache();
    cache.rootFolderId = rootFolderId;
    await saveFolderCache(cache);

    // 2. List all subfolders (Years) under root folder
    const query = `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const yearFiles = await listGoogleDriveFiles(accessToken, query, "id,name");
    console.info(`[GDrive Service] Found ${yearFiles.length} Year folders on Drive.`);

    for (const yearFolder of yearFiles) {
      const yearName = yearFolder.name;
      const yearFolderId = yearFolder.id;
      
      // Update local cache
      cache.yearFolderIds[yearName] = yearFolderId;
      await saveFolderCache(cache);

      // 3. List all markdown files inside this Year folder
      const noteQuery = `'${yearFolderId}' in parents and mimeType = 'text/markdown' and trashed = false`;
      const files = await listGoogleDriveFiles(accessToken, noteQuery, "id,name,modifiedTime");
      console.info(`[GDrive Service] Year ${yearName}: Found ${files.length} markdown notes.`);

      for (const file of files) {
        // Date.md
        const match = file.name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
        if (!match) continue;

        const dateStr = match[1];
        
        // Check if note exists locally
        const existing = await getLocalNoteRecord(dateStr);
        const remoteTime = file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0;
        const localTime = existing ? (existing.updatedAt || 0) : 0;

        if (existing) {
          // Skip downloading only if local is newer and not blank
          if (localTime >= remoteTime && existing.notes.trim() !== "") {
            continue;
          }
        }

        console.info(`[GDrive Service] Downloading missing or updated note for date ${dateStr}...`);
        
        // 4. Download content
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
        const fileRes = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!fileRes.ok) {
          console.error(`[GDrive Service] Failed to download file ${file.name}:`, fileRes.statusText);
          continue;
        }

        const noteContent = await fileRes.text();
        
        // Skip system-generated placeholder notes (e.g. old auto-freeze entries)
        const trimmed = noteContent.trim();
        if (!trimmed || /^\[\s*AUTO-FREEZE\s*\]$/i.test(trimmed) || /^\[\s*FROZEN\s*\]$/i.test(trimmed) || /^\[\s*SYSTEM\s*\]$/i.test(trimmed)) {
          continue;
        }

        // 5. Save to local IndexedDB
        await saveDownloadedNote(dateStr, noteContent);
      }
    }

    console.info("[GDrive Service] Historical daily notes sync-down completed successfully.");
  } catch (err) {
    console.error("[GDrive Service] Failed to pull notes from Drive:", err);
    throw err;
  }
}

const SYNC_LOCK_KEY = "w_gdrive_sync_lock";
const SYNC_LOCK_TIMEOUT_MS = 30000; // 30 seconds safety timeout

function acquireSyncLock(): boolean {
  if (typeof localStorage === "undefined") return true;
  const now = Date.now();
  const lockVal = localStorage.getItem(SYNC_LOCK_KEY);
  if (lockVal) {
    const lockTime = parseInt(lockVal, 10);
    // If the lock is not expired, we fail to acquire it
    if (!isNaN(lockTime) && now - lockTime < SYNC_LOCK_TIMEOUT_MS) {
      return false;
    }
  }
  localStorage.setItem(SYNC_LOCK_KEY, now.toString());
  return true;
}

function releaseSyncLock(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SYNC_LOCK_KEY);
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

  // Acquire cross-process lock to prevent duplicate creation race conditions
  if (!acquireSyncLock()) {
    console.info("[GDrive Service] Another window is currently syncing. Skipping trigger.");
    return;
  }

  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      console.info("[GDrive Service] Skipping sync: User not authenticated with Google Drive.");
      return;
    }

    isSyncRunning = true;
    console.info("[GDrive Service] Background sync worker started.");

    const pendingNotes = await getPendingSyncNotes();
    if (pendingNotes.length === 0) {
      console.info("[GDrive Service] No pending sync items found.");
      return;
    }

    console.info(`[GDrive Service] Found ${pendingNotes.length} notes pending sync.`);

    const resetTime = localStorage.getItem("w_daily_reset_time") || "04:00";
    const today = getToday(undefined, resetTime);

    // Sync notes sequentially to avoid race conditions or folder creation duplication
    for (const note of pendingNotes) {
      if (note.date === today) {
        const lastEditAge = Date.now() - (note.updatedAt || 0);
        // If edited within the last 15 seconds, defer to avoid constant API spamming during typing
        if (lastEditAge < 15000) {
          console.info(`[GDrive Service] Deferring sync of today's note (${note.date}) - active editing detected.`);
          continue;
        }
      }

      try {
        const localStartTimestamp = note.updatedAt;
        const modifiedTimeStr = await syncNoteToDrive(accessToken, note.date, note.notes);
        const serverModifiedTimeMs = new Date(modifiedTimeStr).getTime();
        await clearSyncPending(note.date, localStartTimestamp, serverModifiedTimeMs);
        
        // Dispatch global notification for UI indicators
        window.dispatchEvent(new CustomEvent("w:note-synced", { detail: note.date }));
      } catch (err) {
        console.error(`[GDrive Service] Failed to sync note for date ${note.date}:`, err);
        // Continue to next note in case one is corrupted, leaving this one flagged pending
      }
    }

    const remainingPending = await getPendingSyncNotes();
    if (remainingPending.length > 0) {
      console.info(`[GDrive Service] ${remainingPending.length} pending notes remaining. Scheduling follow-up sync in 5 seconds.`);
      setTimeout(() => {
        runBackgroundSync().catch((err) => {
          console.error("[GDrive Service] Follow-up background sync failed:", err);
        });
      }, 5000);
    }
  } catch (err) {
    console.error("[GDrive Service] Error in background sync lifecycle:", err);
  } finally {
    isSyncRunning = false;
    releaseSyncLock();
    console.info("[GDrive Service] Background sync worker completed cycle.");
  }
}
