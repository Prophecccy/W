import { AlertTriangle } from "lucide-react";
import { Settings } from "../../../shared/types";
import { ManualFreezeToggle } from "../../freeze/components/ManualFreezeToggle";

interface DisciplineSectionProps {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
}

export function DisciplineSection({ settings, onUpdate }: DisciplineSectionProps) {
  const strikeSystemEnabled = settings.strikeSystemEnabled ?? true;

  return (
    <>
      <div className="settings-section" id="settings-discipline">
        <h2 className="settings-section__header t-label">[ STRIKE SYSTEM DISCIPLINE ]</h2>
        <div className="settings-section__content">
          <div className="settings-row settings-row--master">
            <div className="settings-row__label">
              <AlertTriangle size={16} strokeWidth={1.5} style={{ color: strikeSystemEnabled ? "var(--strike-red)" : "var(--text-muted)" }} />
              <div>
                <span className="t-body" style={{ display: "block", fontWeight: 500 }}>Strike System Discipline</span>
                <span className="t-meta text-muted" style={{ display: "block", fontSize: "11px", marginTop: "2px" }}>
                  {strikeSystemEnabled 
                    ? "Active: Incomplete habits and exceeded limiters accrue strikes (0-5), culminating in lockout."
                    : "Disabled: Zen mode. No strikes accrue, no lockouts trigger, and strike counters are concealed."}
                </span>
              </div>
            </div>
            <button
              className={`settings-toggle ${strikeSystemEnabled ? "settings-toggle--on" : ""}`}
              onClick={() => onUpdate({ strikeSystemEnabled: !strikeSystemEnabled })}
              aria-label="Toggle Strike System"
            >
              <span className="settings-toggle__knob" />
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section" id="settings-freeze">
        <h2 className="settings-section__header t-label">[ FREEZE PROTOCOL ]</h2>
        <div className="settings-section__content">
          <div style={{ marginBottom: "12px" }}>
            <span className="t-meta text-muted" style={{ display: "block", fontSize: "11px" }}>
              Emergency defense mechanism: Freezing protects your active habits and stops strikes from accruing during illness, travel, or critical interruptions.
            </span>
          </div>
          <ManualFreezeToggle />
        </div>
      </div>
    </>
  );
}
