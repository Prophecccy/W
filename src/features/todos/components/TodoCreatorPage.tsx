import { useEffect, useState } from "react";
import { TodoForm } from "./TodoForm/TodoForm";
import { getGroups } from "../../habits/services/groupService";
import { HabitGroup } from "../../habits/types";
import "./TodoCreatorPage.css";

async function safeStartDragging() {
  const { isTauri } = await import("../../../shared/utils/tauri");
  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().startDragging();
  }
}

async function safeClose() {
  const { isTauri } = await import("../../../shared/utils/tauri");
  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  }
}

async function safeShowAndFocus() {
  const { isTauri } = await import("../../../shared/utils/tauri");
  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.show().then(() => win.setFocus()).catch(() => {});
  }
}

export function TodoCreatorPage() {
  const [groups, setGroups] = useState<HabitGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [dailyResetTime, setDailyResetTime] = useState("04:00");

  useEffect(() => {
    // Read dailyResetTime from localStorage cache
    const cachedTime = localStorage.getItem("w_daily_reset_time") || "04:00";
    setDailyResetTime(cachedTime);

    getGroups()
      .then((res) => {
        setGroups(res);
        setGroupsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load groups in todo creator:", err);
        setGroupsLoading(false);
      });
  }, []);

  const loading = groupsLoading;

  // Let the user drag the window by holding down on any non-interactive areas
  useEffect(() => {
    const container = document.querySelector(".todo-creator-window-container");
    if (container) {
      const handlePointerDown = (e: PointerEvent) => {
        if (e.target === container || (e.target as HTMLElement).classList.contains("todo-creator-window-content")) {
          safeStartDragging();
        }
      };
      container.addEventListener("pointerdown", handlePointerDown as any);
      return () => container.removeEventListener("pointerdown", handlePointerDown as any);
    }
  }, [loading]);

  const handleClose = async () => {
    try {
      await safeClose();
    } catch (err) {
      console.error("Failed to close window:", err);
    }
  };

  // Show the window when loading completes
  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        safeShowAndFocus();
      }, 50);
    }
  }, [loading]);

  if (loading) {
    return null;
  }

  return (
    <div className="todo-creator-window-container">
      <div className="todo-creator-window-content">
        <TodoForm
          onClose={handleClose}
          onSuccess={handleClose}
          groups={groups}
          dailyResetTime={dailyResetTime}
        />
      </div>
    </div>
  );
}
