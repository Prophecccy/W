import { LucideIcon } from "../../../shared/components/IconPicker/LucideIcon";
import "./LockoutOverlay.css";

interface LockoutOverlayProps {
  onResolve: () => void;
}

export function LockoutOverlay({ onResolve }: LockoutOverlayProps) {
  return (
    <div className="lockout-overlay">
      <div className="lockout-overlay__vignette" />
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
