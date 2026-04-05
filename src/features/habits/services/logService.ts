import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { HabitLog, HabitLogEntry, CompletionEntry } from "../types";
import { getToday } from "../../../shared/utils/dateUtils";

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}

function logRef(userId: string, date: string) {
  return doc(db, "users", userId, "logs", date);
}

// ─── Get / create today's log ────────────────────────────────────

export async function getTodayLog(): Promise<HabitLog> {
  const userId = uid();
  const today = getToday();
  const ref = logRef(userId, today);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data() as HabitLog;
  }

  // Create an empty log for today
  const emptyLog: HabitLog = {
    date: today,
    uid: userId,
    notes: "",
    habits: {},
  };
  await setDoc(ref, emptyLog);
  return emptyLog;
}

// ─── Complete a habit ────────────────────────────────────────────

export async function completeHabit(
  habitId: string,
  value: number = 1,
  target: number = 1,
  timerSeconds: number = 0,
  note: string = ""
): Promise<void> {
  const userId = uid();
  const today = getToday();
  const ref = logRef(userId, today);

  const snap = await getDoc(ref);
  const log = snap.exists() ? (snap.data() as HabitLog) : null;

  const existing: HabitLogEntry = log?.habits?.[habitId] ?? {
    completed: false,
    value: 0,
    target,
    completions: [],
    timerSeconds: 0,
  };

  const entry: CompletionEntry = {
    timestamp: Date.now(),
    value,
    ...(note ? { note } : {}),
  };

  const newEntry: HabitLogEntry = {
    completed: true,
    value: existing.value + value,
    target,
    completions: [...existing.completions, entry],
    timerSeconds: existing.timerSeconds + timerSeconds,
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      date: today,
      uid: userId,
      notes: "",
      habits: { [habitId]: newEntry },
    });
  } else {
    await updateDoc(ref, {
      [`habits.${habitId}`]: newEntry,
    });
  }
}

// ─── Uncomplete a habit (undo) ───────────────────────────────────

export async function uncompleteHabit(habitId: string): Promise<void> {
  const userId = uid();
  const today = getToday();
  const ref = logRef(userId, today);

  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const log = snap.data() as HabitLog;
  const existing = log.habits?.[habitId];
  if (!existing || existing.completions.length === 0) return;

  // Remove last completion
  const newCompletions = existing.completions.slice(0, -1);
  const lastValue = existing.completions[existing.completions.length - 1].value;

  const newEntry: HabitLogEntry = {
    ...existing,
    completed: newCompletions.length > 0,
    value: Math.max(0, existing.value - lastValue),
    completions: newCompletions,
  };

  await updateDoc(ref, {
    [`habits.${habitId}`]: newEntry,
  });
}

// ─── Log range (for analytics) ────────────────────────────────────

export async function getLogRange(
  startDate: string,
  endDate: string
): Promise<HabitLog[]> {
  const userId = uid();
  const logsRef = collection(db, "users", userId, "logs");
  const q = query(
    logsRef,
    where("date", ">=", startDate),
    where("date", "<=", endDate),
    orderBy("date", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as HabitLog);
}

// ─── Update Daily Note ───────────────────────────────────────────

export async function updateNote(notes: string): Promise<void> {
  const userId = uid();
  const today = getToday();
  const ref = logRef(userId, today);
  // getTodayLog ensures doc exists
  await updateDoc(ref, { notes });
}

