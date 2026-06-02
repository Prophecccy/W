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

export async function exportJSON(): Promise<boolean> {
  const userId = uid();
  const userDoc = await getUserDoc(userId);
  const habits = await getAllCollectionData("habits");
  const todos = await getAllCollectionData("todos");
  const logs = await getAllCollectionData("logs");
  const groups = await getAllCollectionData("groups");
  const stickyNotes = await getAllCollectionData("sticky-notes");

  const data = {
    exportedAt: new Date().toISOString(),
    user: userDoc,
    habits,
    todos,
    logs,
    groups,
    "sticky-notes": stickyNotes,
  };

  const json = JSON.stringify(data, null, 2);
  const now = new Date();
  const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const filename = `w_export_${datePart}.json`;
  return await saveFileAs(json, filename, "application/json", "json");
}

// ─── Export CSV ──────────────────────────────────────────────────

export async function exportCSV(): Promise<boolean> {
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
    const logHeaders = ["date", "notes", "habitId", "habitTitle", "value", "target", "completed"];
    const logRows: string[] = [];

    const habitIdToTitle: Record<string, string> = {};
    habits.forEach((h) => {
      if (h.id && h.title) {
        habitIdToTitle[String(h.id)] = String(h.title);
      }
    });

    logs.forEach((l) => {
      const date = String(l.date ?? "");
      const notes = String(l.notes ?? "");
      const habitsMap = (l.habits as Record<string, any>) ?? {};
      const habitKeys = Object.keys(habitsMap);

      if (habitKeys.length === 0) {
        logRows.push([
          escapeCSV(date),
          escapeCSV(notes),
          "",
          "",
          "",
          "",
          ""
        ].join(","));
      } else {
        habitKeys.forEach((habitId) => {
          const entry = habitsMap[habitId] ?? {};
          const title = habitIdToTitle[habitId] ?? "Unknown Habit";
          const val = entry.value !== undefined ? String(entry.value) : "";
          const target = entry.target !== undefined ? String(entry.target) : "";
          const completed = entry.completed !== undefined ? String(entry.completed) : "false";

          logRows.push([
            escapeCSV(date),
            escapeCSV(notes),
            escapeCSV(habitId),
            escapeCSV(title),
            escapeCSV(val),
            escapeCSV(target),
            escapeCSV(completed),
          ].join(","));
        });
      }
    });

    sections.push("=== DAILY LOGS ===");
    sections.push(logHeaders.join(","));
    sections.push(...logRows);
  }

  const csv = sections.join("\n");
  const now = new Date();
  const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const filename = `w_export_${datePart}.csv`;
  return await saveFileAs(csv, filename, "text/csv", "csv");
}

// ─── Utilities ──────────────────────────────────────────────────

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function saveFileAs(content: string, filename: string, mimeType: string, ext: string): Promise<boolean> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");

    const filePath = await save({
      defaultPath: filename,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });

    if (filePath) {
      await writeTextFile(filePath, content);
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Tauri APIs failed, falling back to browser download:", err);
    triggerDownload(content, filename, mimeType);
    return true;
  }
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
