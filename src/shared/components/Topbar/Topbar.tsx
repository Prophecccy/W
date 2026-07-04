import { Search, Minus, Square, X, Download, Snowflake } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUpdateManager } from "../../../features/updater/hooks/useUpdateManager";
import "./Topbar.css";

interface TopbarProps {
  onCommandPaletteOpen: () => void;
  isFrozen?: boolean;
}

const TITLE_MAP: Record<string, string> = {
  "/": "[ DASHBOARD ]",
  "/habits": "[ HABITS ]",
  "/todos": "[ TODOS ]",
  "/logbook": "[ LOGBOOK ]",

  "/analytics": "[ ANALYTICS ]",
  "/settings": "[ SETTINGS ]",
  "/lockdown": "[ LOCKDOWN ]"
};

export function Topbar({ onCommandPaletteOpen, isFrozen = false }: TopbarProps) {
  const { phase, startUpdate } = useUpdateManager();
  const location = useLocation();
  const navigate = useNavigate();

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch {
      /* running in browser, no-op */
    }
  };

  const handleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const isMaximized = await win.isMaximized();
      isMaximized ? await win.unmaximize() : await win.maximize();
    } catch {
      /* running in browser, no-op */
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      /* running in browser, no-op */
    }
  };

  const isTauri = "__TAURI_INTERNALS__" in window;
  const currentTitle = TITLE_MAP[location.pathname] || "[ DASHBOARD ]";

  const handleDrag = async (e: React.PointerEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        getCurrentWindow().startDragging();
      } catch {
        /* running in browser, no-op */
      }
    }
  };

  return (
    <header className="topbar" onPointerDown={handleDrag}>
      <div className="topbar__left">
        <button
          className="topbar__search-btn"
          onClick={onCommandPaletteOpen}
          title="Search (Ctrl+K)"
        >
          <Search size={14} strokeWidth={1.5} />
          <span className="t-meta">CTRL+K</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className="topbar__title">{currentTitle}</span>
          {isFrozen && (
            <button
              className="topbar__freeze-indicator"
              onClick={() => navigate("/settings?tab=data")}
              title="Habits are currently frozen. Click to manage."
            >
              <Snowflake size={11} strokeWidth={2} />
              <span>FROZEN</span>
            </button>
          )}
        </div>
      </div>

      {isTauri && (
        <div className="topbar__window-controls">
          {phase === 'available' && (
            <button 
              className="topbar__update-btn" 
              onClick={startUpdate}
              title="Update Available"
            >
              <Download size={14} strokeWidth={1.5} />
              <span className="t-meta">UPDATE</span>
            </button>
          )}
          <button className="topbar__win-btn" onClick={handleMinimize}>
            <Minus size={14} strokeWidth={1.5} />
          </button>
          <button className="topbar__win-btn" onClick={handleMaximize}>
            <Square size={12} strokeWidth={1.5} />
          </button>
          <button
            className="topbar__win-btn topbar__win-btn--close"
            onClick={handleClose}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </header>
  );
}
