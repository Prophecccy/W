import { LucideIcon } from "../../../shared/components/IconPicker/LucideIcon";
import { isTauri } from "../../../shared/utils/tauri";
import "./LockoutOverlay.css";

interface LockoutOverlayProps {
  onResolve: () => void;
}

export function LockoutOverlay({ onResolve }: LockoutOverlayProps) {
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

        <button className="lockout-overlay__resolve t-label" onClick={onResolve}>
          [ RESOLVE LOCKOUT ]
        </button>
      </div>
    </div>
  );
}
