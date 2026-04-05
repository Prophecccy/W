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

// ─── Export JSON ────────────────────────────────────────────────

export async function exportJSON(): Promise<void> {
  const userId = uid();
  const userDoc = await getUserDoc(userId);
  const habits = await getAllCollectionData("habits");
  const todos = await getAllCollectionData("todos");
  const logs = await getAllCollectionData("logs");

  const data = {
    exportedAt: new Date().toISOString(),
    user: userDoc,
    habits,
    todos,
    logs,
  };

  const json = JSON.stringify(data, null, 2);
  const datePart = new Date().toISOString().split("T")[0];
  triggerDownload(json, `w_export_${datePart}.json`, "application/json");
}

// ─── Export CSV ──────────────────────────────────────────────────

export async function exportCSV(): Promise<void> {
  const habits = await getAllCollectionData("habits");
  const todos = await getAllCollectionData("todos");
  const logs = await getAllCollectionData("logs");

  const sections: string[] = [];

  // ── Habits CSV ─────────────────────────────────────────────────
  if (habits.length > 0) {
    const habitHeaders = ["id", "title", "description", "type", "period", "level", "currentStreak", "longestStreak", "totalCompletions", "isActive", "color", "group"];
    const habitRows = habits.map((h) =>
      habitHeaders.map((key) => escapeCSV(String(h[key] ?? ""))).join(",")
    );
    sections.push("=== HABITS ===");
    sections.push(habitHeaders.join(","));
    sections.push(...habitRows);
    sections.push("");
  }

  // ── Todos CSV ──────────────────────────────────────────────────
  if (todos.length > 0) {
    const todoHeaders = ["id", "title", "type", "status", "color", "deadline", "completedAt", "createdAt"];
    const todoRows = todos.map((t) =>
      todoHeaders.map((key) => escapeCSV(String(t[key] ?? ""))).join(",")
    );
    sections.push("=== TODOS ===");
    sections.push(todoHeaders.join(","));
    sections.push(...todoRows);
    sections.push("");
  }

  // ── Logs CSV ───────────────────────────────────────────────────
  if (logs.length > 0) {
    const logHeaders = ["date", "notes", "habitsCompleted"];
    const logRows = logs.map((l) => {
      const habitsMap = l.habits as Record<string, any> ?? {};
      const completedCount = Object.values(habitsMap).filter((h: any) => h.completed).length;
      return [
        escapeCSV(String(l.date ?? "")),
        escapeCSV(String(l.notes ?? "")),
        String(completedCount),
      ].join(",");
    });
    sections.push("=== DAILY LOGS ===");
    sections.push(logHeaders.join(","));
    sections.push(...logRows);
  }

  const csv = sections.join("\n");
  const datePart = new Date().toISOString().split("T")[0];
  triggerDownload(csv, `w_export_${datePart}.csv`, "text/csv");
}

// ─── Utilities ──────────────────────────────────────────────────

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

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
