import { get as idbGet, set as idbSet } from "idb-keyval";
import { emit, listen } from "@tauri-apps/api/event";
import { encryptNote, decryptNote } from "../utils/noteCrypto";
import { 
  getValidAccessToken, 
  uploadStateToDrive, 
  downloadStateFromDrive 
} from "./googleDriveService";

// ─── Interfaces ──────────────────────────────────────────────────

export interface DocumentReference {
  type: "document";
  id: string;
  path: string;
}

export interface CollectionReference {
  type: "collection";
  id: string;
  path: string;
}

export interface WhereConstraint {
  type: "where";
  field: string;
  op: string;
  value: any;
}

export interface OrderByConstraint {
  type: "orderBy";
  field: string;
  dir: "asc" | "desc";
}

export interface LimitConstraint {
  type: "limit";
  count: number;
}

export type Constraint = WhereConstraint | OrderByConstraint | LimitConstraint;

export interface Query {
  type: "query";
  collectionRef: CollectionReference;
  constraints: Constraint[];
}

export interface DocumentSnapshot {
  id: string;
  exists: () => boolean;
  data: () => any;
  ref: DocumentReference;
}

export interface QuerySnapshot {
  docs: QueryDocumentSnapshot[];
  empty: boolean;
  size: number;
  forEach: (callback: (doc: QueryDocumentSnapshot) => void) => void;
}

export interface QueryDocumentSnapshot {
  id: string;
  exists: () => boolean;
  data: () => any;
  ref: DocumentReference;
}

export interface LocalUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  metadata: {
    lastSignInTime?: string;
    creationTime?: string;
  };
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

// ─── Mock Database Token ──────────────────────────────────────────

export const db = { type: "local-firestore" };

// ─── Reference Constructors ───────────────────────────────────────

export function doc(dbOrCol: any, ...pathSegments: string[]): DocumentReference {
  if (dbOrCol && dbOrCol.type === "collection") {
    const id = typeof crypto !== "undefined" && crypto.randomUUID 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
    const path = `${dbOrCol.path}/${id}`;
    return { type: "document", id, path };
  }
  const path = pathSegments.filter(Boolean).join("/");
  const id = pathSegments[pathSegments.length - 1];
  return { type: "document", id, path };
}

export function collection(_dbInstance: any, ...pathSegments: string[]): CollectionReference {
  const path = pathSegments.filter(Boolean).join("/");
  const id = pathSegments[pathSegments.length - 1];
  return { type: "collection", id, path };
}

// ─── Query Constraint Builders ───────────────────────────────────

export function query(collectionRef: CollectionReference, ...constraints: Constraint[]): Query {
  return { type: "query", collectionRef, constraints };
}

export function where(field: string, op: string, value: any): WhereConstraint {
  return { type: "where", field, op, value };
}

export function orderBy(field: string, dir: "asc" | "desc" = "asc"): OrderByConstraint {
  return { type: "orderBy", field, dir };
}

export function limit(count: number): LimitConstraint {
  return { type: "limit", count };
}

// ─── IndexedDB Storage Accessors ──────────────────────────────────

let localDbLogQueue: string[] = [];
let isLocalDbFlushing = false;
let localDbFlushTimer: ReturnType<typeof setTimeout> | null = null;
const LOCAL_DB_LOG_MAX_BYTES = 100_000; // 100KB max log file size
const LOCAL_DB_FLUSH_DELAY = 5_000; // 5 seconds debounce

async function flushLocalDbLogQueue() {
  if (isLocalDbFlushing || localDbLogQueue.length === 0) return;
  isLocalDbFlushing = true;
  try {
    const { writeTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    let windowLabel = "unknown";
    try {
      windowLabel = (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label || "unknown";
    } catch {}
    const logFile = `w_localdb_${windowLabel}_debug.log`;
    const toWrite = localDbLogQueue.join("\n");
    localDbLogQueue = [];

    // Always overwrite — logs are ephemeral debug data, not worth reading 160K lines
    const trimmed = toWrite.length > LOCAL_DB_LOG_MAX_BYTES
      ? toWrite.slice(-LOCAL_DB_LOG_MAX_BYTES)
      : toWrite;
    await writeTextFile(logFile, trimmed, { baseDir: BaseDirectory.AppData });
  } catch (e) {
    // Silently fail — logging should never block the app
  } finally {
    isLocalDbFlushing = false;
    if (localDbLogQueue.length > 0) {
      scheduleLogFlush();
    }
  }
}

function scheduleLogFlush() {
  if (localDbFlushTimer) return; // already scheduled
  localDbFlushTimer = setTimeout(() => {
    localDbFlushTimer = null;
    flushLocalDbLogQueue().catch(() => {});
  }, LOCAL_DB_FLUSH_DELAY);
}

function localDbLogDebug(msg: string) {
  if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
    const logLine = `[${new Date().toISOString()}] [localDb]: ${msg}`;
    localDbLogQueue.push(logLine);
    scheduleLogFlush();
  }
}

async function getCollectionMap(path: string): Promise<Record<string, any>> {
  const key = `w_col_${path}`;
  localDbLogDebug(`getCollectionMap idbGet: ${key}`);
  const val = await idbGet(key);
  return val || {};
}

async function saveCollectionMap(path: string, map: Record<string, any>): Promise<void> {
  const key = `w_col_${path}`;
  localDbLogDebug(`saveCollectionMap start idbSet: ${key}`);
  await idbSet(key, map);
  localDbLogDebug(`saveCollectionMap end idbSet: ${key}`);
}

async function getDocumentData(path: string): Promise<any | null> {
  localDbLogDebug(`getDocumentData: ${path}`);
  if (path.startsWith("users/") && path.split("/").length === 2) {
    const key = `w_doc_${path}`;
    const res = await idbGet(key);
    return res || null;
  }

  const parts = path.split("/");
  if (parts.length === 4) {
    const [col, uid, subcol, docId] = parts;
    const parentPath = `${col}/${uid}/${subcol}`;
    const map = await getCollectionMap(parentPath);
    return map[docId] || null;
  }

  return null;
}

async function saveDocumentData(path: string, data: any): Promise<void> {
  localDbLogDebug(`saveDocumentData entry: ${path}`);
  if (path.startsWith("users/") && path.split("/").length === 2) {
    const key = `w_doc_${path}`;
    localDbLogDebug(`saveDocumentData users start idbSet: ${key}`);
    await idbSet(key, data);
    localDbLogDebug(`saveDocumentData users end idbSet: ${key}`);
    return;
  }

  const parts = path.split("/");
  if (parts.length === 4) {
    const [col, uid, subcol, docId] = parts;
    const parentPath = `${col}/${uid}/${subcol}`;
    localDbLogDebug(`saveDocumentData subcollection: ${parentPath}, docId: ${docId}`);
    const map = await getCollectionMap(parentPath);
    map[docId] = data;
    await saveCollectionMap(parentPath, map);
  }
}

async function deleteDocumentData(path: string): Promise<void> {
  if (path.startsWith("users/") && path.split("/").length === 2) {
    const key = `w_doc_${path}`;
    const current = await idbGet(key);
    if (current) {
      await idbSet(key, { ...current, deleted: true, updatedAt: Date.now() });
    }
    return;
  }

  const parts = path.split("/");
  if (parts.length === 4) {
    const [col, uid, subcol, docId] = parts;
    const parentPath = `${col}/${uid}/${subcol}`;
    const map = await getCollectionMap(parentPath);
    map[docId] = {
      ...(map[docId] || {}),
      deleted: true,
      updatedAt: Date.now()
    };
    await saveCollectionMap(parentPath, map);
  }
}

// ─── Field Value Builders ────────────────────────────────────────

class ArrayUnionFieldValue {
  constructor(public elements: any[]) {}
}

export function arrayUnion(...elements: any[]) {
  return new ArrayUnionFieldValue(elements);
}

function setNestedField(obj: any, path: string, value: any) {
  const keys = path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in current) || current[k] == null || typeof current[k] !== "object") {
      current[k] = {};
    }
    current = current[k];
  }

  const lastKey = keys[keys.length - 1];
  if (value instanceof ArrayUnionFieldValue) {
    const existingArray = Array.isArray(current[lastKey]) ? current[lastKey] : [];
    const newElements = value.elements.filter(el => !existingArray.includes(el));
    current[lastKey] = [...existingArray, ...newElements];
  } else {
    current[lastKey] = value;
  }
}

// ─── Firestore Operations Implementation ──────────────────────────

export async function getDoc(docRef: DocumentReference): Promise<DocumentSnapshot> {
  localDbLogDebug(`getDoc: ${docRef.path}`);
  const data = await getDocumentData(docRef.path);
  const exists = data !== null && !data.deleted;
  return {
    id: docRef.id,
    exists: () => exists,
    data: () => exists ? data : null,
    ref: docRef,
  };
}

export async function getDocs(queryRef: Query | CollectionReference): Promise<QuerySnapshot> {
  const path = queryRef.type === "query" ? queryRef.collectionRef.path : queryRef.path;
  const map = await getCollectionMap(path);
  let docs = Object.entries(map)
    .map(([id, data]) => ({ id, ...(data as any) }))
    .filter(docVal => !docVal.deleted);

  if (queryRef.type === "query") {
    for (const c of queryRef.constraints) {
      if (c.type === "where") {
        const { field, op, value } = c;
        docs = docs.filter(docVal => {
          const val = docVal[field];
          if (op === "==") return val === value;
          if (op === "!=") return val !== value;
          if (op === ">") return val > value;
          if (op === "<") return val < value;
          if (op === ">=") return val >= value;
          if (op === "<=") return val <= value;
          return true;
        });
      }
    }

    for (const c of queryRef.constraints) {
      if (c.type === "orderBy") {
        const { field, dir } = c;
        docs.sort((a, b) => {
          const valA = a[field];
          const valB = b[field];
          if (valA === valB) return 0;
          if (valA == null) return 1;
          if (valB == null) return -1;
          if (dir === "asc") {
            return valA > valB ? 1 : -1;
          } else {
            return valA < valB ? 1 : -1;
          }
        });
      }
    }

    for (const c of queryRef.constraints) {
      if (c.type === "limit") {
        docs = docs.slice(0, c.count);
      }
    }
  }

  const resultDocs = docs.map(docData => {
    const originalData = { ...docData };
    delete originalData.id;
    const docRefPath = `${path}/${docData.id}`;
    return {
      id: docData.id,
      exists: () => true,
      data: () => originalData,
      ref: { type: "document" as const, id: docData.id, path: docRefPath },
    };
  });

  return {
    docs: resultDocs,
    empty: resultDocs.length === 0,
    size: resultDocs.length,
    forEach(callback: (doc: QueryDocumentSnapshot) => void) {
      resultDocs.forEach(callback);
    }
  };
}

export async function setDoc(docRef: DocumentReference, data: any, options?: { merge?: boolean }): Promise<void> {
  const now = Date.now();
  const dataWithTime = { ...data, updatedAt: now };

  if (options?.merge) {
    const current = await getDocumentData(docRef.path) || {};
    await saveDocumentData(docRef.path, { ...current, ...dataWithTime });
  } else {
    await saveDocumentData(docRef.path, dataWithTime);
  }

  triggerListeners(docRef.path);
  triggerSync();
}

export async function updateDoc(docRef: DocumentReference, updates: Record<string, any>): Promise<void> {
  const now = Date.now();
  const currentData = await getDocumentData(docRef.path) || {};
  const updatedData = { ...currentData, updatedAt: now };

  for (const [key, value] of Object.entries(updates)) {
    if (key.includes(".")) {
      setNestedField(updatedData, key, value);
    } else {
      if (value instanceof ArrayUnionFieldValue) {
        const existingArray = Array.isArray(updatedData[key]) ? updatedData[key] : [];
        const newElements = value.elements.filter(el => !existingArray.includes(el));
        updatedData[key] = [...existingArray, ...newElements];
      } else {
        updatedData[key] = value;
      }
    }
  }

  await saveDocumentData(docRef.path, updatedData);
  triggerListeners(docRef.path);
  triggerSync();
}

export async function deleteDoc(docRef: DocumentReference): Promise<void> {
  await deleteDocumentData(docRef.path);
  triggerListeners(docRef.path);
  triggerSync();
}

export async function addDoc(colRef: CollectionReference, data: any): Promise<DocumentReference> {
  const id = crypto.randomUUID();
  const docRef = doc(db, colRef.path, id);
  await setDoc(docRef, { ...data, id });
  return docRef;
}

// ─── Real-Time Listeners (pub/sub) ────────────────────────────────

interface ActiveListener {
  path: string;
  isCollection: boolean;
  callback: (snapshot: any) => void;
  queryConstraints?: Constraint[];
}

const activeListeners = new Set<ActiveListener>();

export function onSnapshot(
  ref: DocumentReference | CollectionReference | Query,
  onNext: (snapshot: any) => void,
  onError?: (err: Error) => void
): () => void {
  let path = "";
  let isCollection = false;
  let queryConstraints: Constraint[] | undefined;

  if (ref.type === "document") {
    path = ref.path;
    isCollection = false;
  } else if (ref.type === "collection") {
    path = ref.path;
    isCollection = true;
  } else if (ref.type === "query") {
    path = ref.collectionRef.path;
    isCollection = true;
    queryConstraints = ref.constraints;
  }

  const listener: ActiveListener = {
    path,
    isCollection,
    callback: onNext,
    queryConstraints,
  };

  activeListeners.add(listener);

  // Trigger initial load
  triggerInitialLoad(listener, onError);

  return () => {
    activeListeners.delete(listener);
  };
}

async function triggerInitialLoad(listener: ActiveListener, onError?: (err: Error) => void) {
  try {
    const snap = await fetchSnapshotData(listener.path, listener.isCollection, listener.queryConstraints);
    listener.callback(snap);
  } catch (err) {
    if (onError) onError(err as Error);
  }
}

async function fetchSnapshotData(path: string, isCollection: boolean, queryConstraints?: Constraint[]): Promise<any> {
  if (!isCollection) {
    const data = await getDocumentData(path);
    const docId = path.split("/").pop() || "";
    const exists = data !== null && !data.deleted;
    return {
      id: docId,
      exists: () => exists,
      data: () => exists ? data : null,
      ref: { type: "document" as const, id: docId, path },
    };
  } else {
    const map = await getCollectionMap(path);
    let docs = Object.entries(map)
      .map(([id, data]) => ({ id, ...(data as any) }))
      .filter(docVal => !docVal.deleted);

    if (queryConstraints) {
      for (const c of queryConstraints) {
        if (c.type === "where") {
          const { field, op, value } = c;
          docs = docs.filter(docVal => {
            const val = docVal[field];
            if (op === "==") return val === value;
            if (op === "!=") return val !== value;
            if (op === ">") return val > value;
            if (op === "<") return val < value;
            if (op === ">=") return val >= value;
            if (op === "<=") return val <= value;
            return true;
          });
        }
      }

      for (const c of queryConstraints) {
        if (c.type === "orderBy") {
          const { field, dir } = c;
          docs.sort((a, b) => {
            const valA = a[field];
            const valB = b[field];
            if (valA === valB) return 0;
            if (valA == null) return 1;
            if (valB == null) return -1;
            if (dir === "asc") {
              return valA > valB ? 1 : -1;
            } else {
              return valA < valB ? 1 : -1;
            }
          });
        }
      }

      for (const c of queryConstraints) {
        if (c.type === "limit") {
          docs = docs.slice(0, c.count);
        }
      }
    }

    const resultDocs = docs.map(docData => {
      const originalData = { ...docData };
      delete originalData.id;
      const docRefPath = `${path}/${docData.id}`;
      return {
        id: docData.id,
        exists: () => true,
        data: () => originalData,
        ref: { type: "document" as const, id: docData.id, path: docRefPath },
      };
    });

    return {
      docs: resultDocs,
      empty: resultDocs.length === 0,
      size: resultDocs.length,
      forEach(callback: (doc: QueryDocumentSnapshot) => void) {
        resultDocs.forEach(callback);
      }
    };
  }
}

// ─── Sync Notifications Across Webviews ───────────────────────────

function triggerListeners(path: string) {
  runLocalListeners(path);
  emit("w_localdb_write", { path }).catch(() => {});
}

function runLocalListeners(path: string) {
  for (const listener of activeListeners) {
    let matches = false;
    if (listener.isCollection) {
      matches = path.startsWith(listener.path + "/");
    } else {
      matches = listener.path === path;
    }
    if (matches) {
      triggerInitialLoad(listener);
    }
  }
}

export function triggerLocalListenersForEverything(uid: string) {
  runLocalListeners(`users/${uid}`);
  runLocalListeners(`users/${uid}/groups`);
  runLocalListeners(`users/${uid}/habits`);
  runLocalListeners(`users/${uid}/logs`);
  runLocalListeners(`users/${uid}/todos`);
  runLocalListeners(`users/${uid}/sticky-notes`);
  runLocalListeners(`users/${uid}/undoHistory`);
}

export function notifyDataChanged(uid: string) {
  triggerLocalListenersForEverything(uid);
  emit("w_localdb_write", { path: `users/${uid}` }).catch(() => {});
}

if (typeof window !== "undefined") {
  listen("w_localdb_write", (event) => {
    const payload = event.payload as { path: string };
    if (payload?.path) {
      runLocalListeners(payload.path);
    }
  }).catch(() => {});
}

// ─── Batches & Transactions ───────────────────────────────────────

export function writeBatch(_dbInstance: any) {
  const operations: (() => Promise<void>)[] = [];
  return {
    set(docRef: DocumentReference, data: any, options?: { merge?: boolean }) {
      operations.push(() => setDoc(docRef, data, options));
    },
    update(docRef: DocumentReference, data: any) {
      operations.push(() => updateDoc(docRef, data));
    },
    delete(docRef: DocumentReference) {
      operations.push(() => deleteDoc(docRef));
    },
    async commit() {
      for (const op of operations) {
        await op();
      }
    }
  };
}

export async function runTransaction(_dbInstance: any, callback: (transaction: any) => Promise<any>) {
  const updates: { ref: DocumentReference; data: any; isSet?: boolean; options?: any }[] = [];
  const transaction = {
    async get(docRef: DocumentReference) {
      return getDoc(docRef);
    },
    update(docRef: DocumentReference, data: any) {
      updates.push({ ref: docRef, data });
    },
    set(docRef: DocumentReference, data: any, options?: any) {
      updates.push({ ref: docRef, data, isSet: true, options });
    }
  };

  const result = await callback(transaction);

  for (const item of updates) {
    if (item.isSet) {
      await setDoc(item.ref, item.data, item.options);
    } else {
      await updateDoc(item.ref, item.data);
    }
  }

  return result;
}

// ─── Authentication Simulation & State ─────────────────────────────

const authListeners = new Set<(user: LocalUser | null) => void>();

export const auth = {
  get currentUser(): LocalUser | null {
    const userStr = localStorage.getItem("w_auth_user");
    if (!userStr) return null;
    try {
      const u = JSON.parse(userStr);
      return {
        ...u,
        getIdToken: async () => "mock-token",
      };
    } catch {
      return null;
    }
  }
};

export function onAuthStateChanged(
  authInstanceOrCallback: any,
  callback?: (user: LocalUser | null) => void
) {
  const cb = typeof authInstanceOrCallback === "function" ? authInstanceOrCallback : callback;
  if (!cb) return () => {};
  authListeners.add(cb);
  cb(auth.currentUser);
  return () => {
    authListeners.delete(cb);
  };
}

function triggerAuthChange() {
  const user = auth.currentUser;
  for (const cb of authListeners) {
    cb(user);
  }
}

export async function signInAnonymously(_authInstance: any) {
  const mockUser: LocalUser = {
    uid: "local-user",
    email: null,
    displayName: "Guest User",
    photoURL: null,
    metadata: {
      lastSignInTime: new Date().toISOString(),
      creationTime: new Date().toISOString(),
    },
    getIdToken: async () => "mock-token",
  };
  localStorage.setItem("w_auth_user", JSON.stringify(mockUser));
  triggerAuthChange();
  return { user: mockUser };
}

export async function signOut() {
  localStorage.removeItem("w_auth_user");
  localStorage.removeItem("w-auth-mock");
  localStorage.removeItem("driveLinked");
  localStorage.removeItem("w_gdrive_state_modified_time");
  localStorage.removeItem("w_gdrive_state_last_sync");
  
  // Clear OAuth credentials
  const { clearOAuthTokens } = await import("./googleDriveService");
  await clearOAuthTokens();

  // Clear local IndexedDB cache on logout
  try {
    const { clear: idbClear } = await import("idb-keyval");
    await idbClear();
  } catch (err) {
    console.error("Failed to clear local cache on signout:", err);
  }

  triggerAuthChange();
}

export async function deleteUser(_user: LocalUser): Promise<void> {
  await signOut();
}

// ─── Google Drive Data Syncing & Merging Engine ───────────────────

let syncTimeout: number | null = null;
let isSyncing = false;

export function triggerSync() {
  if (syncTimeout) window.clearTimeout(syncTimeout);
  syncTimeout = window.setTimeout(async () => {
    syncTimeout = null;
    await syncToGoogleDrive();
  }, 1000);
}

export async function syncToGoogleDrive() {
  if (isSyncing) return;
  const user = auth.currentUser;
  if (!user) return;

  const isLinked = localStorage.getItem("driveLinked") === "true";
  if (!isLinked) return;

  isSyncing = true;
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      isSyncing = false;
      return;
    }

    const uid = user.uid;
    const userDoc = await idbGet(`w_doc_users/${uid}`);
    if (!userDoc) {
      isSyncing = false;
      return;
    }

    const groups = await idbGet(`w_col_users/${uid}/groups`) || {};
    const habits = await idbGet(`w_col_users/${uid}/habits`) || {};
    const logs = await idbGet(`w_col_users/${uid}/logs`) || {};
    const todos = await idbGet(`w_col_users/${uid}/todos`) || {};
    const stickyNotes = await idbGet(`w_col_users/${uid}/sticky-notes`) || {};
    const undoHistory = await idbGet(`w_col_users/${uid}/undoHistory`) || {};

    const statePayload = {
      user: userDoc,
      groups,
      habits,
      logs,
      todos,
      stickyNotes,
      undoHistory,
      updatedAt: Date.now(),
    };

    const plaintext = JSON.stringify(statePayload);
    const encrypted = await encryptNote(plaintext);
    if (!encrypted) {
      console.warn("[LocalDB] Encryption failed during sync upload.");
      isSyncing = false;
      return;
    }

    const uploadContent = JSON.stringify({ encrypted });
    const modifiedTime = await uploadStateToDrive(accessToken, uploadContent);

    localStorage.setItem("w_gdrive_state_last_sync", Date.now().toString());
    localStorage.setItem("w_gdrive_state_modified_time", modifiedTime);
    console.info("[LocalDB] State uploaded successfully at", new Date().toLocaleTimeString());
  } catch (err) {
    console.error("[LocalDB] Background state upload to Google Drive failed:", err);
  } finally {
    isSyncing = false;
  }
}

export async function pullAndMergeFromGoogleDrive() {
  if (isSyncing) return;
  const user = auth.currentUser;
  if (!user) return;

  const isLinked = localStorage.getItem("driveLinked") === "true";
  if (!isLinked) return;

  isSyncing = true;
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      isSyncing = false;
      return;
    }

    const remoteData = await downloadStateFromDrive(accessToken);
    if (!remoteData) {
      isSyncing = false;
      return;
    }

    const { content, modifiedTime } = remoteData;
    const lastRemoteModifiedTime = localStorage.getItem("w_gdrive_state_modified_time");

    if (lastRemoteModifiedTime && lastRemoteModifiedTime === modifiedTime) {
      console.info("[LocalDB] Google Drive state is already in sync. Skipping pull.");
      isSyncing = false;
      return;
    }

    const parsedEnvelope = JSON.parse(content);
    if (!parsedEnvelope.encrypted) {
      console.error("[LocalDB] Invalid remote state format (missing encrypted payload).");
      isSyncing = false;
      return;
    }

    const decryptedText = await decryptNote(parsedEnvelope.encrypted);
    if (!decryptedText) {
      console.error("[LocalDB] Decryption failed during sync pull.");
      isSyncing = false;
      return;
    }

    const remoteState = JSON.parse(decryptedText);
    const uid = user.uid;

    const localUserDoc = await idbGet(`w_doc_users/${uid}`);
    const localGroups = await idbGet(`w_col_users/${uid}/groups`) || {};
    const localHabits = await idbGet(`w_col_users/${uid}/habits`) || {};
    const localLogs = await idbGet(`w_col_users/${uid}/logs`) || {};
    const localTodos = await idbGet(`w_col_users/${uid}/todos`) || {};
    const localStickyNotes = await idbGet(`w_col_users/${uid}/sticky-notes`) || {};
    const localUndoHistory = await idbGet(`w_col_users/${uid}/undoHistory`) || {};

    const mergedUser = mergeObject(localUserDoc, remoteState.user);
    const mergedGroups = mergeCollection(localGroups, remoteState.groups);
    const mergedHabits = mergeCollection(localHabits, remoteState.habits);
    const mergedLogs = mergeCollection(localLogs, remoteState.logs);
    const mergedTodos = mergeCollection(localTodos, remoteState.todos);
    const mergedStickyNotes = mergeCollection(localStickyNotes, remoteState.stickyNotes);
    const mergedUndoHistory = mergeCollection(localUndoHistory, remoteState.undoHistory);

    await idbSet(`w_doc_users/${uid}`, mergedUser);
    await idbSet(`w_col_users/${uid}/groups`, mergedGroups);
    await idbSet(`w_col_users/${uid}/habits`, mergedHabits);
    await idbSet(`w_col_users/${uid}/logs`, mergedLogs);
    await idbSet(`w_col_users/${uid}/todos`, mergedTodos);
    await idbSet(`w_col_users/${uid}/sticky-notes`, mergedStickyNotes);
    await idbSet(`w_col_users/${uid}/undoHistory`, mergedUndoHistory);

    localStorage.setItem("w_gdrive_state_modified_time", modifiedTime);
    localStorage.setItem("w_gdrive_state_last_sync", Date.now().toString());
    localStorage.setItem(`w_migrated_v2_${uid}`, "true");

    console.info("[LocalDB] Google Drive state pulled and merged successfully.");
    notifyDataChanged(uid);
  } catch (err) {
    console.error("[LocalDB] Background state pull/merge failed:", err);
  } finally {
    isSyncing = false;
  }
}

function mergeObject(local: any, remote: any): any {
  if (!local) return remote;
  if (!remote) return local;

  const localTime = local.updatedAt || local.createdAt || 0;
  const remoteTime = remote.updatedAt || remote.createdAt || 0;

  if (remoteTime > localTime) {
    return { ...local, ...remote };
  }
  return { ...remote, ...local };
}

function mergeCollection(local: Record<string, any>, remote: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = { ...local };
  if (!remote) return merged;

  for (const [id, remoteItem] of Object.entries(remote)) {
    const localItem = local[id];
    if (!localItem) {
      merged[id] = remoteItem;
    } else {
      const localTime = localItem.updatedAt || localItem.createdAt || localItem.timestamp || 0;
      const remoteTime = remoteItem.updatedAt || remoteItem.createdAt || remoteItem.timestamp || 0;
      if (remoteTime > localTime) {
        merged[id] = remoteItem;
      }
    }
  }
  return merged;
}

// ─── Setup Auto-Sync Listeners ────────────────────────────────────

if (typeof window !== "undefined") {
  window.addEventListener("w:gdrive-linked", () => {
    pullAndMergeFromGoogleDrive();
  });

  window.setInterval(() => {
    pullAndMergeFromGoogleDrive();
  }, 120_000); // Check for remote updates every 2 minutes
}
