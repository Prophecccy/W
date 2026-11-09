import { useState, useRef, useEffect } from "react";
import { Search, Minus, Square, X, Download, Snowflake, HelpCircle, ChevronDown, LayoutDashboard, Target, ListChecks, BookOpen, Settings, Menu } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUpdateManager } from "../../../features/updater/hooks/useUpdateManager";
import { GoogleDriveIcon } from "../GoogleDriveIcon/GoogleDriveIcon";
import "./Topbar.css";

// Pre-import so startDragging fires instantly on pointer-down (no async delay)
let _getCurrentWindow: (() => any) | null = null;
import("@tauri-apps/api/window")
  .then(m => { _getCurrentWindow = m.getCurrentWindow; })
  .catch(() => {});

interface TopbarProps {
  onCommandPaletteOpen: () => void;
  isFrozen?: boolean;
  onToggleNavDrawer?: () => void;
  isNavDrawerOpen?: boolean;
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

export function Topbar({
  onCommandPaletteOpen,
  isFrozen = false,
  onToggleNavDrawer,
  isNavDrawerOpen = false,
}: TopbarProps) {
  const { phase, startUpdate } = useUpdateManager();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDriveExpired, setIsDriveExpired] = useState(false);
  const [isReauthing, setIsReauthing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      if (localStorage.getItem("driveLinked") === "true") {
        try {
          const { getValidAccessToken } = await import("../../../shared/services/googleDriveService");
          const token = await getValidAccessToken();
          if (active && !token) {
            setIsDriveExpired(true);
          }
        } catch {
          if (active) setIsDriveExpired(true);
        }
      }
    };
    checkStatus();

    const handleExpired = () => setIsDriveExpired(true);
    const handleLinked = () => setIsDriveExpired(false);
    const handleUnlinked = () => setIsDriveExpired(false);

    window.addEventListener("w:gdrive-session-expired", handleExpired);
    window.addEventListener("w:gdrive-linked", handleLinked);
    window.addEventListener("w:gdrive-unlinked", handleUnlinked);

    return () => {
      active = false;
      window.removeEventListener("w:gdrive-session-expired", handleExpired);
      window.removeEventListener("w:gdrive-linked", handleLinked);
      window.removeEventListener("w:gdrive-unlinked", handleUnlinked);
    };
  }, []);

  const handleReauth = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsReauthing(true);
    try {
      const { signInWithGoogle } = await import("../../../features/auth/services/authService");
      await signInWithGoogle();
      setIsDriveExpired(false);
      const { pullAndMergeFromGoogleDrive } = await import("../../../shared/services/localDb");
      await pullAndMergeFromGoogleDrive(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("w:toast", {
            detail: "[ GOOGLE DRIVE RE-LINKED & SYNCED ]",
          })
        );
      }
    } catch (err) {
      console.error("[Topbar] Re-authentication failed:", err);
    } finally {
      setIsReauthing(false);
    }
  };

  const handleUnfreeze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { deactivateFreeze } = await import("../../../features/freeze/services/freezeService");
      await deactivateFreeze();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("w:toast", {
            detail: "[ HABITS RESUMED — FREEZE DEACTIVATED ]",
          })
        );
      }
    } catch (err) {
      console.error("[Topbar] Failed to deactivate freeze:", err);
    }
  };

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
        {onToggleNavDrawer && (
          <button
            className={`topbar__drawer-toggle-btn ${isNavDrawerOpen ? 'topbar__drawer-toggle-btn--active' : ''}`}
            onClick={onToggleNavDrawer}
            title={isNavDrawerOpen ? "Close navigation" : "Open navigation menu"}
            type="button"
            aria-label="Toggle navigation drawer"
          >
            <Menu size={16} strokeWidth={1.5} />
          </button>
        )}
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
              type="button"
              className="topbar__freeze-indicator"
              onClick={handleUnfreeze}
              title="Habits are currently frozen. Click to resume all habits."
            >
              <Snowflake size={11} strokeWidth={2} />
              <span>[ FROZEN — CLICK TO RESUME ]</span>
            </button>
          )}
          {isDriveExpired && (
            <button
              type="button"
              className="topbar__freeze-indicator"
              style={{
                borderColor: "rgba(248, 113, 113, 0.5)",
                color: "var(--strike-red)",
                background: "rgba(248, 113, 113, 0.08)",
              }}
              onClick={handleReauth}
              disabled={isReauthing}
              title="Google Drive session expired. Click to re-link and sync today's completed habits."
            >
              <GoogleDriveIcon size={11} />
              <span>{isReauthing ? "[ RE-LINKING... ]" : "[ SYNC PENDING — RE-LINK ]"}</span>
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
