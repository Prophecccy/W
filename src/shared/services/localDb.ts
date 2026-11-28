import { get as idbGet, set as idbSet } from "idb-keyval";
import { emit, listen } from "@tauri-apps/api/event";
import { decryptNote, resetEncryptionKeyCache } from "../utils/noteCrypto";
import { computePayloadSha256, sanitizeStrikesShape, verifyPayloadSha256 } from "../utils/integrity";
import { isSyncCapableContext } from "../utils/tauri";
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

function cleanPathSegments(segments: (string | undefined | null)[]): string[] {
  return segments
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .flatMap((s) => s.replace(/\\/g, "/").split("/"))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "." && s !== "..");
}

function generateCryptoId(): string {
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
  }
  throw new Error("Cryptographically secure random generator is unavailable.");
}

export function doc(dbOrCol: any, ...pathSegments: string[]): DocumentReference {
  if (dbOrCol && dbOrCol.type === "collection") {
    const id = generateCryptoId();
    const path = `${dbOrCol.path}/${id}`;
    return { type: "document", id, path };
  }
  const clean = cleanPathSegments(pathSegments);
  const path = clean.join("/");
  const id = clean[clean.length - 1] || "";
  return { type: "document", id, path };
}

export function collection(_dbInstance: any, ...pathSegments: string[]): CollectionReference {
  const clean = cleanPathSegments(pathSegments);
  const path = clean.join("/");
  const id = clean[clean.length - 1] || "";
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
  if (import.meta.env.DEV && typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
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

const DANGEROUS_PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function setNestedField(obj: any, path: string, value: any) {
  const keys = path.split(".");
  for (const seg of keys) {
    if (!seg || DANGEROUS_PROTO_KEYS.has(seg)) {
      throw new Error(`[localDb Security] Blocked dangerous nested key segment "${seg}".`);
    }
  }
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!Object.prototype.hasOwnProperty.call(current, k) || current[k] == null || typeof current[k] !== "object") {
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
          const val = docVal[field] !== undefined ? docVal[field] : (field === "date" ? docVal.id : undefined);
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
          const valA = a[field] !== undefined ? a[field] : (field === "date" ? a.id : undefined);
          const valB = b[field] !== undefined ? b[field] : (field === "date" ? b.id : undefined);
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
    if (originalData.date === undefined && path.includes("/logs")) {
      originalData.date = docData.id;
    }
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

// ─── Data Access Layer Storage Validation Gate ───────────────────

export function validateDocumentPayload<T = any>(data: unknown, path: string): T {
  if (!path || typeof path !== "string" || path.trim().length === 0) {
    throw new Error("[localDb Security] Write rejected: Empty document path.");
  }
  if (path.includes("..") || path.includes("\\")) {
    throw new Error(`[localDb Security] Write rejected: Path traversal sequence detected in "${path}".`);
  }
  if (path.length > 300) {
    throw new Error(`[localDb Security] Write rejected: Path exceeds maximum length (300 chars): "${path}".`);
  }
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`[localDb Security] Write rejected at "${path}": Payload must be a non-null plain object.`);
  }

  // Recursive prototype pollution defense & key validation
  function sanitizeDeep(current: any, depth = 0): any {
    if (depth > 20) {
      throw new Error(`[localDb Security] Write rejected at "${path}": Nesting depth exceeds maximum (20).`);
    }
    if (current == null || typeof current !== "object") return current;
    if (current instanceof ArrayUnionFieldValue) return current;
    if (Array.isArray(current)) {
      return current.map(item => sanitizeDeep(item, depth + 1));
    }
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(current)) {
      if (
        DANGEROUS_PROTO_KEYS.has(key) ||
        (depth === 0 && key.includes(".") && key.split(".").some((seg) => DANGEROUS_PROTO_KEYS.has(seg)))
      ) {
        console.warn(`[localDb Security] Prototype pollution key "${key}" neutralized at path "${path}".`);
        continue;
      }
      clean[key] = sanitizeDeep(value, depth + 1);
    }
    return clean;
  }

  const cleanData = sanitizeDeep(data);

  // Size boundary check to prevent IndexedDB storage exhaustion DoS
  const isLargeEntity = path.includes("notes") || path.includes("log") || path.includes("backup");
  const MAX_BYTES = isLargeEntity ? 5_000_000 : 500_000;
  
  try {
    const serialized = JSON.stringify(cleanData);
    if (serialized.length > MAX_BYTES) {
      throw new Error(`[localDb Security] Write rejected: Payload size (${serialized.length} bytes) exceeds limit (${MAX_BYTES} bytes) at "${path}".`);
    }
  } catch (e: any) {
    if (e.message?.includes("exceeds limit")) throw e;
    throw new Error(`[localDb Security] Write rejected at "${path}": Non-serializable payload (circular reference detected).`);
  }

  return cleanData as T;
}

export async function setDoc(docRef: DocumentReference, data: any, options?: { merge?: boolean }): Promise<void> {
  const validated = validateDocumentPayload(data, docRef.path);
  const now = Date.now();
  const dataWithTime = { ...validated, updatedAt: now };

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
  const validated = validateDocumentPayload(updates, docRef.path);
  const now = Date.now();
  const currentData = await getDocumentData(docRef.path) || {};
  const updatedData = { ...currentData, updatedAt: now };

  for (const [key, value] of Object.entries(validated)) {
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
            const val = docVal[field] !== undefined ? docVal[field] : (field === "date" ? docVal.id : undefined);
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
            const valA = a[field] !== undefined ? a[field] : (field === "date" ? a.id : undefined);
            const valB = b[field] !== undefined ? b[field] : (field === "date" ? b.id : undefined);
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
      if (originalData.date === undefined && path.includes("/logs")) {
        originalData.date = docData.id;
      }
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
    if (listener.path === path) {
      // 1. Exact match (document or collection)
      matches = true;
    } else if (listener.isCollection && path.startsWith(listener.path + "/")) {
      // 2. A document inside this collection was modified
      matches = true;
    } else if (listener.path.startsWith(path + "/")) {
      // 3. A parent path / container (e.g., "users/UID/logs" or "users/UID") was updated
      matches = true;
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
  emit("w_data_synced", { uid }).catch(() => {});
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("w:data-synced", { detail: { uid } }));
  }
}

if (typeof window !== "undefined") {
  listen("w_localdb_write", (event) => {
    const payload = event.payload as { path: string };
    if (payload?.path) {
      runLocalListeners(payload.path);
    }
  }).catch(() => {});

  listen("w_data_synced", (event) => {
    const payload = event.payload as { uid: string };
    if (payload?.uid) {
      triggerLocalListenersForEverything(payload.uid);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("w:data-synced", { detail: payload }));
      }
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
      if (!u || typeof u.uid !== "string" || !u.uid.trim()) {
        return null;
      }
      return {
        ...u,
        getIdToken: async () => "",
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

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "w_auth_user") {
      triggerAuthChange();
      window.dispatchEvent(new CustomEvent("w:auth-changed"));
    }
  });
  if ((window as any).__TAURI_INTERNALS__) {
    listen("w_auth_changed", () => {
      triggerAuthChange();
      window.dispatchEvent(new CustomEvent("w:auth-changed"));
    }).catch(() => {});
  }
}

export async function signInAnonymously(_authInstance: any) {
  if (!import.meta.env.DEV) {
    throw new Error("Anonymous sign-in is disabled outside development builds.");
  }
  const mockUser: LocalUser = {
    uid: "local-user",
    email: null,
    displayName: "Guest User",
    photoURL: null,
    metadata: {
      lastSignInTime: new Date().toISOString(),
      creationTime: new Date().toISOString(),
    },
    getIdToken: async () => "",
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
  
  // Clear OAuth credentials and in-memory crypto key handles
  resetEncryptionKeyCache();
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
let hasPendingSync = false;

export function triggerSync() {
  if (syncTimeout) window.clearTimeout(syncTimeout);
  syncTimeout = window.setTimeout(async () => {
    syncTimeout = null;
    await syncToGoogleDrive();
  }, 250);
}

export async function syncToGoogleDrive() {
  if (!isSyncCapableContext()) {
    return;
  }
  if (isSyncing) {
    hasPendingSync = true;
    return;
  }
  const user = auth.currentUser;
  if (!user) return;

  const isLinked = localStorage.getItem("driveLinked") === "true";
  if (!isLinked) return;

  isSyncing = true;
  try {
    do {
      hasPendingSync = false;
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        console.warn("[LocalDB] State upload aborted: No valid access token. User must re-authenticate.");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("w:gdrive-session-expired"));
        }
        break;
      }

      const uid = user.uid;
      const rawUserDoc = await idbGet(`w_doc_users/${uid}`);
      if (!rawUserDoc) {
        break;
      }

      // Security: Never sync local API credentials (groqApiKey) to cloud Drive state
      const userDoc = { ...rawUserDoc };
      if (userDoc.settings && typeof userDoc.settings === "object") {
        const { groqApiKey: _stripped, ...safeSettings } = userDoc.settings;
        userDoc.settings = safeSettings;
      }

      const groups = await idbGet(`w_col_users/${uid}/groups`) || {};
      const habits = await idbGet(`w_col_users/${uid}/habits`) || {};
      const logs = await idbGet(`w_col_users/${uid}/logs`) || {};
      const todos = await idbGet(`w_col_users/${uid}/todos`) || {};
      const stickyNotes = await idbGet(`w_col_users/${uid}/sticky-notes`) || {};
      const undoHistory = await idbGet(`w_col_users/${uid}/undoHistory`) || {};

      const statePayload = {
        version: 2,
        ownerEmail: user.email || null,
        ownerUid: user.uid,
        user: userDoc,
        groups,
        habits,
        logs,
        todos,
        stickyNotes,
        undoHistory,
        updatedAt: Date.now(),
      };
      const integritySha256 = await computePayloadSha256(statePayload);

      const uploadContent = JSON.stringify({ ...statePayload, integritySha256 }, null, 2);
      const modifiedTime = await uploadStateToDrive(accessToken, uploadContent);

      localStorage.setItem("w_gdrive_state_last_sync", Date.now().toString());
      localStorage.setItem("w_gdrive_state_modified_time", modifiedTime);
      console.info("[LocalDB] State uploaded successfully at", new Date().toLocaleTimeString());
    } while (hasPendingSync);
  } catch (err) {
    console.error("[LocalDB] Background state upload to Google Drive failed:", err);
  } finally {
    isSyncing = false;
    if (hasPendingSync) {
      hasPendingSync = false;
      setTimeout(() => {
        syncToGoogleDrive().catch(console.error);
      }, 50);
    }
  }
}

export async function pullAndMergeFromGoogleDrive(force = false): Promise<boolean> {
  if (!isSyncCapableContext()) {
    return false;
  }
  if (isSyncing) {
    if (force) {
      let waitCount = 0;
      while (isSyncing && waitCount < 30) {
        await new Promise((r) => setTimeout(r, 100));
        waitCount++;
      }
      if (isSyncing) return false;
    } else {
      return false;
    }
  }
  const user = auth.currentUser;
  if (!user) return false;

  const isLinked = localStorage.getItem("driveLinked") === "true";
  if (!isLinked) return false;

  isSyncing = true;
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      console.warn("[LocalDB] State pull aborted: No valid access token. User must re-authenticate.");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("w:gdrive-session-expired"));
      }
      isSyncing = false;
      return false;
    }

    const uid = user.uid;
    const localUserDoc = await idbGet(`w_doc_users/${uid}`);
    const isLocallyLocked = localUserDoc?.strikes?.current >= 5;

    // If force is true or user is currently locked out locally, bypass modifiedTime check
    const ifModifiedSince = (force || isLocallyLocked)
      ? undefined
      : (localStorage.getItem("w_gdrive_state_modified_time") || undefined);

    const remoteData = await downloadStateFromDrive(accessToken, ifModifiedSince, force || isLocallyLocked);
    if (!remoteData || remoteData.notModified) {
      isSyncing = false;
      return false;
    }

    const { content, modifiedTime } = remoteData;
    const lastRemoteModifiedTime = localStorage.getItem("w_gdrive_state_modified_time");

    if (!force && !isLocallyLocked && lastRemoteModifiedTime && lastRemoteModifiedTime === modifiedTime) {
      console.info("[LocalDB] Google Drive state is already in sync. Skipping pull.");
      isSyncing = false;
      return false;
    }

    let remoteState: any = null;
    const parsedEnvelope = JSON.parse(content);
    if (parsedEnvelope && parsedEnvelope.encrypted) {
      const decryptedText = await decryptNote(parsedEnvelope.encrypted);
      if (decryptedText) {
        try {
          remoteState = JSON.parse(decryptedText);
        } catch {
          // ignore
        }
      }
    }

    if (!remoteState && parsedEnvelope && typeof parsedEnvelope === "object") {
      remoteState = (parsedEnvelope.habits !== undefined || parsedEnvelope.todos !== undefined || parsedEnvelope.user !== undefined)
        ? parsedEnvelope
        : (parsedEnvelope.state || null);
    }

    if (!remoteState) {
      console.warn("[LocalDB] Unrecognized remote state format or decryption failed.");
      isSyncing = false;
      return false;
    }

    // ─── Integrity Verification (OWASP A08) ───
    if (typeof remoteState.integritySha256 === "string") {
      const { integritySha256, ...unsignedState } = remoteState;
      const digestValid = await verifyPayloadSha256(unsignedState, integritySha256);
      if (!digestValid) {
        console.error("[LocalDB] SECURITY ABORT: Remote state integritySha256 verification failed.");
        isSyncing = false;
        return false;
      }
    }

    const normalizedRemoteEmail = typeof remoteState.ownerEmail === "string"
      ? remoteState.ownerEmail.toLowerCase().trim()
      : "";
    const normalizedLocalEmail = typeof user.email === "string"
      ? user.email.toLowerCase().trim()
      : "";

    if (normalizedRemoteEmail && normalizedLocalEmail && normalizedRemoteEmail !== normalizedLocalEmail) {
      console.error("[LocalDB] SECURITY ABORT: Remote state ownerEmail does not match authenticated user.");
      isSyncing = false;
      return false;
    }

    const hasVerifiedEmailMatch = Boolean(normalizedRemoteEmail && normalizedLocalEmail && normalizedRemoteEmail === normalizedLocalEmail);
    if (remoteState.ownerUid && user.uid && remoteState.ownerUid !== user.uid && !hasVerifiedEmailMatch) {
      console.error("[LocalDB] SECURITY ABORT: Remote state ownerUid mismatch without verified email match.");
      isSyncing = false;
      return false;
    }

    if (remoteState.version === 2 && !normalizedRemoteEmail) {
      console.error("[LocalDB] SECURITY ABORT: v2 remote state missing ownerEmail.");
      isSyncing = false;
      return false;
    }

    const localGroups = await idbGet(`w_col_users/${uid}/groups`) || {};
    const localHabits = await idbGet(`w_col_users/${uid}/habits`) || {};
    const localLogs = await idbGet(`w_col_users/${uid}/logs`) || {};
    const localTodos = await idbGet(`w_col_users/${uid}/todos`) || {};
    const localStickyNotes = await idbGet(`w_col_users/${uid}/sticky-notes`) || {};
    const localUndoHistory = await idbGet(`w_col_users/${uid}/undoHistory`) || {};

    const mergedUser = mergeObject(localUserDoc, remoteState.user);
    if (mergedUser && typeof mergedUser === "object") {
      // Preserve local-only groqApiKey if present; never accept remote groqApiKey injection
      if (mergedUser.settings && typeof mergedUser.settings === "object") {
        delete mergedUser.settings.groqApiKey;
        if (localUserDoc?.settings?.groqApiKey) {
          mergedUser.settings.groqApiKey = localUserDoc.settings.groqApiKey;
        }
      }
      const boundedStrikes = sanitizeStrikesShape(mergedUser.strikes);
      if (boundedStrikes) {
        mergedUser.strikes = boundedStrikes;
      }
    }

    const sanitizedUser = mergedUser ? validateDocumentPayload(mergedUser, `users/${uid}`) : null;
    const mergedGroups = validateDocumentPayload(mergeCollection(localGroups, remoteState.groups), `users/${uid}/groups`);
    const mergedHabits = validateDocumentPayload(mergeCollection(localHabits, remoteState.habits), `users/${uid}/habits`);
    const mergedLogs = validateDocumentPayload(mergeLogsCollection(localLogs, remoteState.logs), `users/${uid}/logs`);
    const mergedTodos = validateDocumentPayload(mergeCollection(localTodos, remoteState.todos), `users/${uid}/todos`);
    const mergedStickyNotes = validateDocumentPayload(mergeCollection(localStickyNotes, remoteState.stickyNotes), `users/${uid}/sticky-notes`);
    const mergedUndoHistory = validateDocumentPayload(mergeCollection(localUndoHistory, remoteState.undoHistory), `users/${uid}/undoHistory`);

    await idbSet(`w_doc_users/${uid}`, sanitizedUser);
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
    return true;
  } catch (err) {
    console.error("[LocalDB] Background state pull/merge failed:", err);
    return false;
  } finally {
    isSyncing = false;
    if (hasPendingSync) {
      hasPendingSync = false;
      setTimeout(() => {
        syncToGoogleDrive().catch(console.error);
      }, 50);
    }
  }
}

function mergeObject(local: any, remote: any): any {
  if (!local) return remote;
  if (!remote) return local;

  const localTime = local.updatedAt || local.createdAt || 0;
  const remoteTime = remote.updatedAt || remote.createdAt || 0;

  const merged = remoteTime > localTime
    ? { ...local, ...remote }
    : { ...remote, ...local };

  // Deep-merge settings so individual remote/local settings aren't wiped out by shallow object spread
  if (remote.settings || local.settings) {
    const newerSettings = remoteTime > localTime
      ? { ...(local.settings || {}), ...(remote.settings || {}) }
      : { ...(remote.settings || {}), ...(local.settings || {}) };

    // Explicit opt-out of strike system must be respected across devices
    if (remote.settings?.strikeSystemEnabled === false || local.settings?.strikeSystemEnabled === false) {
      newerSettings.strikeSystemEnabled = false;
    }

    merged.settings = newerSettings;
  }

  // If strike system is disabled anywhere, force strikes.current = 0
  if (merged.settings?.strikeSystemEnabled === false) {
    merged.strikes = {
      ...(merged.strikes || {}),
      current: 0,
    };
  }

  // If remote shows the lockout was cleared (strikes.current === 0),
  // prevent a stale local gap run from re-locking the account
  if (remote.strikes && remote.strikes.current === 0 && merged.strikes && merged.strikes.current > 0) {
    console.info("[LocalDB] Remote lockout resolution detected. Resetting current strikes to 0.");
    merged.strikes = {
      ...merged.strikes,
      current: 0,
    };
    if (remote.lastActiveDate) {
      merged.lastActiveDate = remote.lastActiveDate;
    }
  }

  // ── Multi-Device Freeze Reconciliation ──────────────────────────
  const remoteLastActive = remote.lastActiveDate || "";
  const localLastActive = local.lastActiveDate || "";

  // If remote shows freeze is not active, but local was falsely auto-frozen by dormant absence:
  if (remote.freeze && remote.freeze.active === false && local.freeze?.reason === "auto_absence") {
    console.info("[LocalDB] Remote active state detected. Overriding false local auto-absence freeze.");
    merged.freeze = {
      ...(local.freeze || {}),
      active: false,
      reason: null,
      startDate: null,
      endDate: null,
    };
    if (remote.lastActiveDate) {
      merged.lastActiveDate = remote.lastActiveDate;
    }
  } else if ((!remote.freeze || remote.freeze.active === false) && local.freeze?.reason === "auto_absence" && remoteLastActive >= (local.freeze.startDate || "")) {
    console.info("[LocalDB] Remote active state without freeze detected. Overriding false local auto-absence freeze.");
    merged.freeze = {
      ...(local.freeze || {}),
      active: false,
      reason: null,
      startDate: null,
      endDate: null,
    };
    if (remote.lastActiveDate) {
      merged.lastActiveDate = remote.lastActiveDate;
    }
  } else if (remoteLastActive > localLastActive && remote.freeze) {
    // Remote device is active much more recently; remote freeze state is authoritative
    merged.freeze = { ...remote.freeze };
    merged.lastActiveDate = remote.lastActiveDate;
  } else if (remoteLastActive > localLastActive) {
    if (local.freeze?.reason === "auto_absence") {
      merged.freeze = {
        ...(local.freeze || {}),
        active: false,
        reason: null,
        startDate: null,
        endDate: null,
      };
    }
    merged.lastActiveDate = remote.lastActiveDate;
  }

  return merged;
}

export function mergeDailyLog(localLog: any, remoteLog: any): any {
  if (!localLog) return remoteLog;
  if (!remoteLog) return localLog;

  const localDocTime = localLog.updatedAt || 0;
  const remoteDocTime = remoteLog.updatedAt || 0;

  const mergedHabits: Record<string, any> = { ...(localLog.habits || {}) };

  // Collect all habit keys from both local and remote
  const allHabitIds = new Set<string>([
    ...Object.keys(localLog.habits || {}),
    ...Object.keys(remoteLog.habits || {}),
  ]);

  for (const habitId of allHabitIds) {
    const localHabit = localLog.habits?.[habitId];
    const remoteHabit = remoteLog.habits?.[habitId];

    if (!localHabit && remoteHabit) {
      mergedHabits[habitId] = remoteHabit;
      continue;
    }
    if (localHabit && !remoteHabit) {
      mergedHabits[habitId] = localHabit;
      continue;
    }

    // Both sides have an entry for this habit.
    // Calculate effective modification timestamp for each side.
    const getHabitTime = (habit: any, fallbackDocTime: number): number => {
      if (habit.updatedAt && typeof habit.updatedAt === "number") return habit.updatedAt;
      if (habit.timestamp && typeof habit.timestamp === "number") return habit.timestamp;
      const comps = Array.isArray(habit.completions) ? habit.completions : [];
      if (comps.length > 0) {
        const maxCompTime = Math.max(...comps.map((c: any) => c.timestamp || 0));
        if (maxCompTime > 0) return maxCompTime;
      }
      return fallbackDocTime;
    };

    const localTime = getHabitTime(localHabit, localDocTime);
    const remoteTime = getHabitTime(remoteHabit, remoteDocTime);

    if (remoteTime > localTime) {
      // Remote is strictly newer for this habit (e.g. undo on web, or completion on web)
      mergedHabits[habitId] = remoteHabit;
    } else if (localTime > remoteTime) {
      // Local is strictly newer for this habit (e.g. undo on desktop, or completion on desktop)
      mergedHabits[habitId] = localHabit;
    } else {
      // Timestamps match. If completions differ, union non-duplicates.
      const localComps: any[] = Array.isArray(localHabit.completions) ? localHabit.completions : [];
      const remoteComps: any[] = Array.isArray(remoteHabit.completions) ? remoteHabit.completions : [];
      const compMap = new Map<number, any>();
      for (const c of [...localComps, ...remoteComps]) {
        if (c && c.timestamp) compMap.set(c.timestamp, c);
      }
      const allComps = Array.from(compMap.values()).sort((a, b) => a.timestamp - b.timestamp);
      const target = localHabit.target ?? remoteHabit.target ?? 1;
      const totalVal = allComps.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
      const isCompleted = localHabit.completed && remoteHabit.completed
        ? true
        : (localHabit.completed || remoteHabit.completed)
          ? (allComps.length > 0 && totalVal >= target)
          : false;

      mergedHabits[habitId] = {
        ...(remoteHabit || localHabit),
        completed: isCompleted,
        value: totalVal,
        target,
        completions: allComps,
        updatedAt: localTime,
      };
    }
  }

  return {
    ...(remoteDocTime > localDocTime ? localLog : remoteLog),
    ...(remoteDocTime > localDocTime ? remoteLog : localLog),
    habits: mergedHabits,
    updatedAt: Math.max(localDocTime, remoteDocTime),
  };
}

function mergeLogsCollection(local: Record<string, any>, remote: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = { ...local };
  if (!remote) return merged;

  for (const [dateKey, remoteLog] of Object.entries(remote)) {
    const localLog = local[dateKey];
    if (!localLog) {
      merged[dateKey] = remoteLog;
    } else {
      merged[dateKey] = mergeDailyLog(localLog, remoteLog);
    }
  }
  return merged;
}

export function mergeCollection(local: Record<string, any>, remote: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = { ...local };
  if (!remote) return merged;

  for (const [id, remoteItem] of Object.entries(remote)) {
    const localItem = local[id];
    if (!localItem) {
      merged[id] = remoteItem;
    } else {
      const localTime = localItem.updatedAt || localItem.completedAt || localItem.createdAt || localItem.timestamp || 0;
      const remoteTime = remoteItem.updatedAt || remoteItem.completedAt || remoteItem.createdAt || remoteItem.timestamp || 0;

      if (remoteTime > localTime) {
        // Remote is strictly newer (e.g. updated, completed, deleted, or restored on remote)
        merged[id] = remoteItem;
      } else if (localTime > remoteTime) {
        // Local is strictly newer (e.g. updated, completed, deleted, or restored locally)
        merged[id] = localItem;
      } else {
        // Timestamps match: if either is marked deleted, tombstone wins to prevent resurrection
        const isDeleted = Boolean(localItem.deleted || remoteItem.deleted);
        merged[id] = {
          ...localItem,
          ...remoteItem,
          deleted: isDeleted,
          updatedAt: localTime,
        };
      }
    }
  }
  return merged;
}

// ─── Setup Auto-Sync Listeners ────────────────────────────────────

if (typeof window !== "undefined" && isSyncCapableContext()) {
  let isSessionExpired = false;
  let pollIntervalMs = 2_500;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  window.addEventListener("w:gdrive-linked", () => {
    isSessionExpired = false;
    pollIntervalMs = 2_500;
    pullAndMergeFromGoogleDrive();
    scheduleNextPoll();
  });

  window.addEventListener("w:gdrive-session-expired", () => {
    isSessionExpired = true;
    pollIntervalMs = 60_000; // Back off to 60s when session expires to prevent hammering
  });

  window.addEventListener("w:gdrive-unlinked", () => {
    isSessionExpired = false;
    pollIntervalMs = 60_000;
  });

  function scheduleNextPoll() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      const isLinked = localStorage.getItem("driveLinked") === "true";
      if (!isLinked || isSessionExpired) {
        // Stop high-frequency polling if not linked or session has expired
        pollIntervalMs = 60_000;
        scheduleNextPoll();
        return;
      }
      // Multi-window coordination: avoid duplicate concurrent polls across windows within 2s
      const lastPoll = Number(localStorage.getItem("w_gdrive_last_poll") || 0);
      const now = Date.now();
      if (now - lastPoll >= 2000) {
        localStorage.setItem("w_gdrive_last_poll", now.toString());
        await pullAndMergeFromGoogleDrive();
      }
      scheduleNextPoll();
    }, pollIntervalMs);
  }

  scheduleNextPoll();

  // Eager sync on window focus (e.g. switching from desktop app to browser or vice versa)
  window.addEventListener("focus", () => {
    if (!isSessionExpired && localStorage.getItem("driveLinked") === "true") {
      pollIntervalMs = 2_500;
      pullAndMergeFromGoogleDrive();
      scheduleNextPoll();
    }
  });

  // Eager sync on tab visibility change
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      pollIntervalMs = (!isSessionExpired && localStorage.getItem("driveLinked") === "true") ? 2_500 : 60_000;
      if (!isSessionExpired && localStorage.getItem("driveLinked") === "true") {
        pullAndMergeFromGoogleDrive();
      }
    } else {
      pollIntervalMs = 10_000;
    }
    scheduleNextPoll();
  });
}

