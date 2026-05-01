// ─── Lockdown Violation Overlay ──────────────────────────────────
// Full-screen red flash when a blocked app is detected.
// Auto-dismisses after 4 seconds.

import { ShieldAlert } from "lucide-react";
import "../../settings/components/LockdownSection.css";

interface LockdownViolationOverlayProps {
  appTitle: string;
  matchedRule: string;
}

export function LockdownViolationOverlay({ appTitle: _appTitle, matchedRule }: LockdownViolationOverlayProps) {
  return (
    <div className="lockdown-violation-overlay">
      <ShieldAlert size={64} className="lockdown-violation-overlay__icon" />
      <div className="lockdown-violation-overlay__title">
        VIOLATION DETECTED
      </div>
      <div className="lockdown-violation-overlay__app">
        {matchedRule.toUpperCase()}
      </div>
      <div className="lockdown-violation-overlay__strike">
        +1 STRIKE ISSUED
      </div>
    </div>
  );
}
