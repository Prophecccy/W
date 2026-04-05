import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../shared/config/firebase";
import { auth } from "../../../shared/config/firebase";
import { Habit } from "../types";

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}

function habitsRef(userId: string) {
  return collection(db, "users", userId, "habits");
}

// ─── Create ─────────────────────────────────────────────────────

export async function createHabit(
  habitData: Omit<Habit, "id" | "uid">
): Promise<Habit> {
  const userId = uid();
  const ref = await addDoc(habitsRef(userId), {
    ...habitData,
    uid: userId,
    createdAt: Date.now(),
  });
  return { ...habitData, id: ref.id, uid: userId };
}

// ─── Read ────────────────────────────────────────────────────────

export async function getHabits(): Promise<Habit[]> {
  const userId = uid();
  const q = query(
    habitsRef(userId),
    where("isActive", "==", true),
    orderBy("order", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Habit));
}

export async function getHabitById(habitId: string): Promise<Habit | null> {
  const userId = uid();
  const docRef = doc(db, "users", userId, "habits", habitId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Habit;
}

// ─── Update ──────────────────────────────────────────────────────

/** Editable fields: title, description, icon, color only. Period/type/metric locked. */
export type EditableHabitFields = Pick<Habit, "title" | "description" | "icon" | "color">;

export async function updateHabit(
  habitId: string,
  updates: Partial<Habit>
): Promise<void> {
  const userId = uid();
  const docRef = doc(db, "users", userId, "habits", habitId);
  await updateDoc(docRef, updates as { [x: string]: any });
}

// ─── Archive ─────────────────────────────────────────────────────

export async function archiveHabit(habitId: string): Promise<void> {
  const userId = uid();
  const docRef = doc(db, "users", userId, "habits", habitId);
  await updateDoc(docRef, {
    isActive: false,
    archivedAt: Date.now(),
  });
}

// ─── Delete ──────────────────────────────────────────────────────

export async function deleteHabit(habitId: string): Promise<void> {
  const userId = uid();
  const docRef = doc(db, "users", userId, "habits", habitId);
  await deleteDoc(docRef);
}

// ─── Reorder ─────────────────────────────────────────────────────

/** Batch-updates the `order` field for a list of habit IDs in the given array order. */
export async function reorderHabits(habitIds: string[]): Promise<void> {
  const userId = uid();
  const batch = writeBatch(db);
  habitIds.forEach((habitId, index) => {
    const docRef = doc(db, "users", userId, "habits", habitId);
    batch.update(docRef, { order: index });
  });
  await batch.commit();
}
