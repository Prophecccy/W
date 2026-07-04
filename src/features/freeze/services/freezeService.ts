import { db, auth, doc, getDoc, updateDoc, arrayUnion, writeBatch } from "../../../shared/config/firebase";
import { FreezeState, FreezeHistoryEntry, FreezeReason, AUTO_FREEZE_THRESHOLD_DAYS } from "../types";
import { getToday, formatDate } from "../../../shared/utils/dateUtils";

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}

function userRef(userId: string) {
  return doc(db, "users", userId);
}

// ─── Default state ───────────────────────────────────────────────

const DEFAULT_FREEZE: FreezeState = {
  active: false,
  startDate: null,
  endDate: null,
  reason: null,
  lastInteractionDate: getToday(),
  history: [],
};

// ─── Read ────────────────────────────────────────────────────────

export async function getFreezeState(): Promise<FreezeState> {
  const userId = uid();
  const snap = await getDoc(userRef(userId));
  if (!snap.exists()) throw new Error("User doc not found");
  const data = snap.data();
  const raw = (data.freeze ?? { ...DEFAULT_FREEZE, lastInteractionDate: data.lastActiveDate ?? getToday() }) as FreezeState;
  // Ensure history is always an array (Firestore may omit it on first activation)
  if (!Array.isArray(raw.history)) {
    raw.history = [];
  }
  return raw;
}

export async function isCurrentlyFrozen(): Promise<boolean> {
  const freeze = await getFreezeState();
  return freeze.active;
}

// ─── Activate ────────────────────────────────────────────────────

export async function activateFreeze(
  reason: FreezeReason,
  startDate?: string
): Promise<void> {
  const userId = uid();
  const effectiveStart = startDate ?? getToday();

  await updateDoc(userRef(userId), {
    "freeze.active": true,
    "freeze.startDate": effectiveStart,
    "freeze.endDate": null,
    "freeze.reason": reason,
  });
}

// ─── Deactivate ──────────────────────────────────────────────────

export async function deactivateFreeze(): Promise<void> {
  const userId = uid();
  const freeze = await getFreezeState();

  if (!freeze.active || !freeze.startDate) return;

  const today = getToday();

  // Calculate days frozen
  const start = new Date(freeze.startDate + "T12:00:00");
  const end = new Date(today + "T12:00:00");
  const daysCount = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  const historyEntry: FreezeHistoryEntry = {
    startDate: freeze.startDate,
    endDate: today,
    reason: freeze.reason ?? "manual",
    daysCount,
  };

  await updateDoc(userRef(userId), {
    "freeze.active": false,
    "freeze.startDate": null,
    "freeze.endDate": null,
    "freeze.reason": null,
    "freeze.lastInteractionDate": today,
    "freeze.history": arrayUnion(historyEntry),
  });
}

// ─── Auto-Freeze Detection ──────────────────────────────────────

/**
 * Checks if the user has been absent for ≥ AUTO_FREEZE_THRESHOLD_DAYS.
 * If so, retroactively activates freeze starting from `lastInteractionDate + 1`.
 *
 * Returns { triggered, frozenSince } so the UI can show WelcomeBack.
 */
let logQueue: string[] = [];
let isFlushing = false;

async function flushLogQueue() {
  if (isFlushing || logQueue.length === 0) return;
  if (typeof window === "undefined" || !(window as any).__TAURI_INTERNALS__) {
    // Browser mode: clear queue and print to console
    logQueue = [];
    return;
  }
  isFlushing = true;
  try {
    const { writeTextFile, readTextFile, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    let windowLabel = "unknown";
    try {
      windowLabel = (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label || "unknown";
    } catch {}
    const logFile = `w_gap_${windowLabel}_debug.log`;
    const toWrite = logQueue.join("\n");
    logQueue = [];
    
    let currentLogs = "";
    try {
      if (await exists(logFile, { baseDir: BaseDirectory.AppData })) {
        currentLogs = await readTextFile(logFile, { baseDir: BaseDirectory.AppData });
      }
    } catch (e) {}
    
    const newLogs = currentLogs + "\n" + toWrite;
    await writeTextFile(logFile, newLogs, { baseDir: BaseDirectory.AppData });
  } catch (e) {
    console.error("Failed to flush log queue:", e);
  } finally {
    isFlushing = false;
    if (logQueue.length > 0) {
      flushLogQueue().catch(() => {});
    }
  }
}

function logDebug(message: string) {
  console.log(message);
  const logLine = new Date().toISOString() + " [FREEZE]: " + message;
  logQueue.push(logLine);
  flushLogQueue().catch(() => {});
}

export async function checkAutoFreeze(
  lastInteractionDate: string,
  today: string
): Promise<{ triggered: boolean; frozenSince: string | null }> {
  logDebug(`checkAutoFreeze entry. lastInteractionDate: ${lastInteractionDate}, today: ${today}`);
  if (!lastInteractionDate || !today || lastInteractionDate === "Invalid Date" || today === "Invalid Date") {
    logDebug("Invalid dates on checkAutoFreeze entry, returning.");
    return { triggered: false, frozenSince: null };
  }

  // BUG 1: Freeze State Overwrite in Auto-Absence Conflict
  logDebug("checkAutoFreeze: Fetching freezeState...");
  const freezeState = await getFreezeState();
  logDebug(`checkAutoFreeze: freezeState fetched: ${JSON.stringify(freezeState)}`);
  if (freezeState.active) {
    logDebug("checkAutoFreeze: Freeze is already active, returning early.");
    return { triggered: false, frozenSince: null };
  }

  const lastDate = new Date(lastInteractionDate + "T12:00:00");
  const todayDate = new Date(today + "T12:00:00");
  if (isNaN(lastDate.getTime()) || isNaN(todayDate.getTime())) {
    logDebug("checkAutoFreeze: Invalid date parsed, returning early.");
    return { triggered: false, frozenSince: null };
  }

  const gapDays = Math.round(
    (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  logDebug(`checkAutoFreeze: gapDays calculated: ${gapDays} (AUTO_FREEZE_THRESHOLD_DAYS: ${AUTO_FREEZE_THRESHOLD_DAYS})`);

  if (gapDays < AUTO_FREEZE_THRESHOLD_DAYS) {
    return { triggered: false, frozenSince: null };
  }

  // Auto-freeze retroactively: freeze started the day after last interaction
  const freezeStart = new Date(lastDate);
  freezeStart.setDate(freezeStart.getDate() + 1);
  const frozenSince = formatDate(freezeStart);
  logDebug(`checkAutoFreeze: Activating freeze. frozenSince: ${frozenSince}...`);

  await activateFreeze("auto_absence", frozenSince);
  logDebug("checkAutoFreeze: Freeze activated. Writing retroactive logs...");

  // Write retroactive log documents to Firestore for the gap days in a single batch
  const userId = uid();
  let logDate = new Date(freezeStart);
  const todayD = new Date(todayDate);
  
  const { collection, query, where, getDocs } = await import("../../../shared/config/firebase");
  const logsRef = collection(db, "users", userId, "logs");
  const gapStartStr = formatDate(freezeStart);
  const yesterdayDate = new Date(todayD);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const gapEndStr = formatDate(yesterdayDate);

  logDebug(`checkAutoFreeze: Querying logs between ${gapStartStr} and ${gapEndStr}...`);
  const logsQuery = query(
    logsRef,
    where("date", ">=", gapStartStr),
    where("date", "<=", gapEndStr)
  );
  const existingLogsSnap = await getDocs(logsQuery);
  logDebug(`checkAutoFreeze: Logs query done. Count: ${existingLogsSnap.size}`);
  const existingDates = new Set<string>();
  existingLogsSnap.forEach((doc) => {
    const data = doc.data();
    if (data.notes || (data.habits && Object.keys(data.habits).length > 0)) {
      existingDates.add(doc.id);
    }
  });

  logDebug(`checkAutoFreeze: Preparing batch writes for ${gapDays} potential days...`);
  let batch = writeBatch(db);
  let batchCount = 0;

  while (logDate < todayD) {
    const logDateStr = formatDate(logDate);
    
    if (!existingDates.has(logDateStr)) {
      const logDocRef = doc(db, "users", userId, "logs", logDateStr);
      
      // SECURITY: notes field is NEVER written to Firestore — local-only
      batch.set(logDocRef, {
        date: logDateStr,
        uid: userId,
        habits: {}
      }, { merge: true });
      
      batchCount++;
      // Firestore writeBatch has a limit of 500 operations.
      // Commit intermediate batch if it gets close to the limit.
      if (batchCount >= 450) {
        logDebug(`checkAutoFreeze: Committing intermediate batch of ${batchCount} operations...`);
        // BUG 3: Unhandled Batch Write Failures in Auto-Freeze Background Loop
        await batch.commit();
        logDebug("checkAutoFreeze: Intermediate batch committed.");
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
    
    logDate.setDate(logDate.getDate() + 1);
  }

  if (batchCount > 0) {
    logDebug(`checkAutoFreeze: Committing final batch of ${batchCount} operations...`);
    // BUG 3: Unhandled Batch Write Failures in Auto-Freeze Background Loop
    await batch.commit();
    logDebug("checkAutoFreeze: Final batch committed.");
  }

  logDebug("checkAutoFreeze: Finished successfully.");
  return { triggered: true, frozenSince };
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Given a freeze state, check if a specific date falls within the frozen range.
 * Used by the gap processor to skip penalties.
 */
export function isDateFrozen(
  freeze: FreezeState,
  dateStr: string
): boolean {
  if (!freeze || !freeze.active || !freeze.startDate) return false;
  // Active freeze: any date >= startDate is frozen
  return dateStr >= freeze.startDate;
}

/**
 * Check frozen ranges from history + active range for a specific date.
 */
export function isDateInFreezeRange(
  freeze: FreezeState,
  dateStr: string
): boolean {
  if (!freeze) return false;
  // Check active freeze
  if (freeze.active && freeze.startDate && dateStr >= freeze.startDate) {
    return true;
  }

  // Check historical freeze entries
  for (const entry of (freeze.history ?? [])) {
    if (dateStr >= entry.startDate && dateStr <= entry.endDate) {
      return true;
    }
  }

  return false;
}

// ─── Update interaction date ─────────────────────────────────────

export async function updateInteractionDate(): Promise<void> {
  const userId = uid();
  const today = getToday();
  await updateDoc(userRef(userId), {
    "freeze.lastInteractionDate": today,
  });
}
