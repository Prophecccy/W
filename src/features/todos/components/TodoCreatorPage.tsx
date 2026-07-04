import { useEffect, useState } from "react";
import { TodoForm } from "./TodoForm/TodoForm";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWidgetData } from "../../widget/hooks/useWidgetData";
import { getGroups } from "../../habits/services/groupService";
import { HabitGroup } from "../../habits/types";
import "./TodoCreatorPage.css";

export function TodoCreatorPage() {
  const { userDoc, loading: widgetLoading } = useWidgetData();
  const [groups, setGroups] = useState<HabitGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  useEffect(() => {
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

  const loading = widgetLoading || groupsLoading;
  const dailyResetTime = userDoc?.settings?.dailyResetTime;

  // Let the user drag the window by holding down on any non-interactive areas
  useEffect(() => {
    // We can allow dragging the container
    const container = document.querySelector(".todo-creator-window-container");
    if (container) {
      const handlePointerDown = (e: PointerEvent) => {
        // Only drag if clicking on the background container itself
        if (e.target === container || (e.target as HTMLElement).classList.contains("todo-creator-window-content")) {
          getCurrentWindow().startDragging();
        }
      };
      container.addEventListener("pointerdown", handlePointerDown as any);
      return () => container.removeEventListener("pointerdown", handlePointerDown as any);
    }
  }, [loading]);

  const handleClose = async () => {
    try {
      const win = getCurrentWindow();
      await win.close();
    } catch (err) {
      console.error("Failed to close window:", err);
    }
  };

  // Show the window when loading completes
  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        getCurrentWindow().show().then(() => {
          getCurrentWindow().setFocus();
        }).catch((err) => console.error("Failed to show window:", err));
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
