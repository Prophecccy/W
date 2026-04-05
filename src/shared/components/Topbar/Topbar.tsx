import { Search, Minus, Square, X } from "lucide-react";
import "./Topbar.css";

interface TopbarProps {
  onCommandPaletteOpen: () => void;
}

export function Topbar({ onCommandPaletteOpen }: TopbarProps) {
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

  return (
    <header className="topbar" data-tauri-drag-region>
      <div className="topbar__left">
        <button
          className="topbar__search-btn"
          onClick={onCommandPaletteOpen}
          title="Search (Ctrl+K)"
        >
          <Search size={14} strokeWidth={1.5} />
          <span className="t-meta">CTRL+K</span>
        </button>
      </div>

      <div className="topbar__window-controls">
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
    </header>
  );
}
