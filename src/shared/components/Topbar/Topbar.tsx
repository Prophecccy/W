import { useState, useRef, useEffect } from "react";
import { Search, Minus, Square, X, Download, Snowflake, HelpCircle, ChevronDown, LayoutDashboard, Target, ListChecks, BookOpen, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUpdateManager } from "../../../features/updater/hooks/useUpdateManager";
import "./Topbar.css";

// Pre-import so startDragging fires instantly on pointer-down (no async delay)
let _getCurrentWindow: (() => any) | null = null;
import("@tauri-apps/api/window")
  .then(m => { _getCurrentWindow = m.getCurrentWindow; })
  .catch(() => {});

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
  "/lockdown": "[ LOCKDOWN ]",
  "/manual": "[ MANUAL ]"
};

export function Topbar({ onCommandPaletteOpen, isFrozen = false }: TopbarProps) {
  const { phase, startUpdate } = useUpdateManager();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

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

  const handleDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) {
      if (_getCurrentWindow) {
        _getCurrentWindow().startDragging();
      } else {
        // Fallback: import hasn't resolved yet (unlikely after initial load)
        import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
          _getCurrentWindow = getCurrentWindow;
          getCurrentWindow().startDragging();
        }).catch(() => {});
      }
    }
  };

  return (
    <header className="topbar" onPointerDown={handleDrag}>
      <div className="topbar__left">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            className="topbar__search-btn"
            onClick={onCommandPaletteOpen}
            title="Search (Ctrl+K)"
          >
            <Search size={14} strokeWidth={1.5} />
            <span className="t-meta topbar__search-meta">CTRL+K</span>
          </button>
          <button
            className="topbar__search-btn topbar__help-btn"
            onClick={() => navigate("/manual")}
            title="Field Manual (Ctrl+/)"
          >
            <HelpCircle size={14} strokeWidth={1.5} />
            <span className="t-meta">MANUAL</span>
          </button>
        </div>
        <div className="topbar__title-wrapper" ref={dropdownRef}>
          <button 
            className="topbar__title-btn" 
            onClick={() => setMenuOpen(prev => !prev)}
            type="button"
            title="Switch section"
          >
            <span className="topbar__title">{currentTitle}</span>
            <ChevronDown size={11} className={`topbar__title-chevron ${menuOpen ? 'topbar__title-chevron--open' : ''}`} />
          </button>
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

          {menuOpen && (
            <div className="topbar__nav-dropdown animate-pulse">
              <button
                className={`topbar__nav-dropdown-item ${location.pathname === '/' ? 'topbar__nav-dropdown-item--active' : ''}`}
                onClick={() => { navigate('/'); setMenuOpen(false); }}
              >
                <LayoutDashboard size={14} />
                <span>[ DASHBOARD ]</span>
              </button>
              <button
                className={`topbar__nav-dropdown-item ${location.pathname === '/habits' ? 'topbar__nav-dropdown-item--active' : ''}`}
                onClick={() => { navigate('/habits'); setMenuOpen(false); }}
              >
                <Target size={14} />
                <span>[ HABITS ]</span>
              </button>
              <button
                className={`topbar__nav-dropdown-item ${location.pathname === '/todos' ? 'topbar__nav-dropdown-item--active' : ''}`}
                onClick={() => { navigate('/todos'); setMenuOpen(false); }}
              >
                <ListChecks size={14} />
                <span>[ TODOS ]</span>
              </button>
              <button
                className={`topbar__nav-dropdown-item ${location.pathname === '/logbook' ? 'topbar__nav-dropdown-item--active' : ''}`}
                onClick={() => { navigate('/logbook'); setMenuOpen(false); }}
              >
                <BookOpen size={14} />
                <span>[ LOGBOOK ]</span>
              </button>
              <button
                className={`topbar__nav-dropdown-item ${location.pathname === '/settings' ? 'topbar__nav-dropdown-item--active' : ''}`}
                onClick={() => { navigate('/settings'); setMenuOpen(false); }}
              >
                <Settings size={14} />
                <span>[ SETTINGS ]</span>
              </button>
            </div>
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
