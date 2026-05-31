import { Sunrise, Moon, Type } from "lucide-react";
import { Settings } from "../../../shared/types";
import { TimeInput } from "../../../shared/components/RadialTimePicker/TimeInput";

interface SleepTubeSectionProps {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
}

export function SleepTubeSection({ settings, onUpdate }: SleepTubeSectionProps) {
  const wakeUpTime = settings.wakeUpTime;
  const bedTime    = settings.bedTime;
  const emptyTubeText = settings.emptyTubeText ?? 'DEPLETED';

  return (
    <div className="settings-section" id="settings-sleep-tube">
      <h2 className="settings-section__header t-label">[ SLEEP TUBE ]</h2>

      <div className="settings-section__content">
        {/* Wake Up Time */}
        <div className="settings-row">
          <div className="settings-row__label">
            <Sunrise size={14} strokeWidth={1.5} />
            <span className="t-body">Wake Up Time</span>
          </div>
          <TimeInput
            id="sleep-tube-wake-up"
            value={wakeUpTime}
            onChange={(v) => onUpdate({ wakeUpTime: v })}
          />
        </div>

        {/* Bed Time */}
        <div className="settings-row">
          <div className="settings-row__label">
            <Moon size={14} strokeWidth={1.5} />
            <span className="t-body">Bed Time</span>
          </div>
          <TimeInput
            id="sleep-tube-bed-time"
            value={bedTime}
            onChange={(v) => onUpdate({ bedTime: v })}
          />
        </div>

        {/* Depletion Text */}
        <div className="settings-row">
          <div className="settings-row__label">
            <Type size={14} strokeWidth={1.5} />
            <span className="t-body">Depletion Text</span>
          </div>
          <input
            className="settings-input"
            type="text"
            value={emptyTubeText}
            maxLength={15}
            placeholder="DEPLETED"
            onChange={(e) => onUpdate({ emptyTubeText: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
