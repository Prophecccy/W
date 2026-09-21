import { useState } from "react";
import { LucideIcon } from "../../../shared/components/IconPicker/LucideIcon";
import { isTauri } from "../../../shared/utils/tauri";
import "./LockoutOverlay.css";

interface LockoutOverlayProps {
  onResolve: () => void;
}

export function LockoutOverlay({ onResolve }: LockoutOverlayProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleSyncFromDrive = async () => {
    setSyncing(true);
    setSyncStatus("[ CONNECTING TO GOOGLE DRIVE... ]");
    try {
      const { getValidAccessToken } = await import("../../../shared/services/googleDriveService");
      let token = await getValidAccessToken();
      if (!token) {
        setSyncStatus("[ AUTHENTICATING... ]");
        const { signInWithGoogle } = await import("../../auth/services/authService");
        await signInWithGoogle();
        token = await getValidAccessToken();
      }

      if (!token) {
        setSyncStatus("[ SYNC FAILED: RE-AUTH REQUIRED ]");
        return;
      }

      setSyncStatus("[ CHECKING CLOUD STATE... ]");
      const { pullAndMergeFromGoogleDrive } = await import("../../../shared/services/localDb");
      const pulled = await pullAndMergeFromGoogleDrive(true);
      if (pulled) {
        setSyncStatus("[ SYNC COMPLETE: UPDATING... ]");
      } else {
        setSyncStatus("[ UP TO DATE ]");
      }
    } catch (err: any) {
      console.error("[LockoutOverlay] Cloud sync failed:", err);
      setSyncStatus(`[ SYNC ERROR: ${err?.message || "CHECK CONNECTION"} ]`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncStatus(null), 4000);
    }
  };

  const handleDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && (
      e.target.closest("button") ||
      e.target.closest("input") ||
      e.target.closest("a")
    )) return;

    if (isTauri()) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        getCurrentWindow().startDragging();
      }).catch(() => {});
    }
  };

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch {}
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {}
  };

  return (
    <div
      className="lockout-overlay"
      onPointerDown={handleDrag}
      data-tauri-drag-region
    >
      <div className="lockout-overlay__vignette" />

      {isTauri() && (
        <div className="lockout-overlay__window-controls">
          <button
            type="button"
            className="lockout-overlay__win-btn"
            onClick={handleMinimize}
            title="Minimize"
          >
            <LucideIcon name="Minus" size={14} />
          </button>
          <button
            type="button"
            className="lockout-overlay__win-btn lockout-overlay__win-btn--close"
            onClick={handleClose}
            title="Close"
          >
            <LucideIcon name="X" size={14} />
          </button>
        </div>
      )}

      <div className="lockout-overlay__content">
        <div className="lockout-overlay__icon-ring">
          <LucideIcon name="ShieldAlert" size={48} />
        </div>
        
        <h1 className="t-display lockout-overlay__title">[ SYSTEM LOCKED ]</h1>
        
        <p className="t-body lockout-overlay__desc">
          You have reached 5/5 strikes. All habit tracking is suspended until you resolve this lockout.
        </p>

        <div className="lockout-overlay__strike-bar">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="lockout-overlay__strike-pip filled" />
          ))}
        </div>

        <div className="lockout-overlay__actions">
          <button className="lockout-overlay__resolve t-label" onClick={onResolve}>
            [ RESOLVE LOCKOUT ]
          </button>
          <button 
            className="lockout-overlay__sync t-label" 
            onClick={handleSyncFromDrive}
            disabled={syncing}
          >
            {syncing ? (syncStatus || "[ SYNCING... ]") : "[ SYNC FROM GOOGLE DRIVE ]"}
          </button>
        </div>
        {syncStatus && !syncing && (
          <div className="lockout-overlay__sync-status t-meta">{syncStatus}</div>
        )}
      </div>
    </div>
  );
}
