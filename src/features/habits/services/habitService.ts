import { db, auth, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, writeBatch } from "../../../shared/config/firebase";
import { sanitizeText } from "../../../shared/utils/security";
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
  const createdAt = Date.now();
  const sanitizedData = {
    ...habitData,
    title: sanitizeText(habitData.title, 100),
    description: habitData.description ? sanitizeText(habitData.description, 500) : undefined,
  };
  const ref = await addDoc(habitsRef(userId), {
    ...sanitizedData,
    uid: userId,
    createdAt,
  });
  return { ...sanitizedData, id: ref.id, uid: userId, createdAt } as Habit;
}

// ─── Read ────────────────────────────────────────────────────────

/**
 * Fetches all active habits.
 * NOTE: Requires Firestore composite index: isActive ASC, order ASC
 */
export async function getHabits(): Promise<Habit[]> {
  const userId = uid();
  const q = query(
    habitsRef(userId),
    where("isActive", "==", true),
    orderBy("order", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Habit))
    .filter((h) => !h.isArchived);
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
  const sanitizedUpdates = { ...updates };
  if (typeof sanitizedUpdates.title === "string") {
    sanitizedUpdates.title = sanitizeText(sanitizedUpdates.title, 100);
  }
  if (typeof sanitizedUpdates.description === "string") {
    sanitizedUpdates.description = sanitizeText(sanitizedUpdates.description, 500);
  }
  await updateDoc(docRef, sanitizedUpdates as { [x: string]: any });
}

// ─── Archive ─────────────────────────────────────────────────────

export async function archiveHabit(habitId: string): Promise<void> {
  const userId = uid();
  const docRef = doc(db, "users", userId, "habits", habitId);
  await updateDoc(docRef, {
    isActive: false,
    isArchived: true,
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
