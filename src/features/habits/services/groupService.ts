import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../shared/config/firebase";
import { auth } from "../../../shared/config/firebase";
import { HabitGroup } from "../types";

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}

function groupsRef(userId: string) {
  return collection(db, "users", userId, "groups");
}

export function sanitizeGroupName(name: string): string {
  let cleaned = name.trim();
  while (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    cleaned = cleaned.substring(1, cleaned.length - 1).trim();
  }
  return cleaned;
}

export async function createGroup(name: string, order: number): Promise<HabitGroup> {
  const userId = uid();
  const sanitized = sanitizeGroupName(name);
  if (!sanitized) {
    throw new Error("Group name cannot be empty");
  }

  const existing = await getGroups();
  const lower = sanitized.toLowerCase();
  if (existing.some((g) => sanitizeGroupName(g.name).toLowerCase() === lower)) {
    throw new Error("Group name already exists");
  }

  const ref = await addDoc(groupsRef(userId), {
    name: sanitized,
    order,
    createdAt: Date.now(),
  });
  return { id: ref.id, name: sanitized, order };
}

export async function getGroups(): Promise<HabitGroup[]> {
  const userId = uid();
  const q = query(groupsRef(userId), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(
    (d) =>
      ({
        id: d.id,
        name: d.data().name,
        order: d.data().order,
      } as HabitGroup)
  );
}

export async function updateGroup(id: string, name: string): Promise<void> {
  const userId = uid();
  const sanitized = sanitizeGroupName(name);
  if (!sanitized) {
    throw new Error("Group name cannot be empty");
  }

  const existing = await getGroups();
  const lower = sanitized.toLowerCase();
  if (existing.some((g) => g.id !== id && sanitizeGroupName(g.name).toLowerCase() === lower)) {
    throw new Error("Group name already exists");
  }

  await updateDoc(doc(db, "users", userId, "groups", id), { name: sanitized });
}

export async function deleteGroup(id: string): Promise<void> {
  const userId = uid();
  await deleteDoc(doc(db, "users", userId, "groups", id));
}

export async function reorderGroups(groups: HabitGroup[]): Promise<void> {
  const userId = uid();
  const batch = writeBatch(db);

  groups.forEach((g) => {
    const ref = doc(db, "users", userId, "groups", g.id);
    batch.update(ref, { order: g.order });
  });

  await batch.commit();
}
