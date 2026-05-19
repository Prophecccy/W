import { Clock, CalendarDays, Globe } from "lucide-react";
import { Settings } from "../../../shared/types";
import { TimeInput } from "../../../shared/components/RadialTimePicker/TimeInput";

// Get all available timezones
function getTimezones(): string[] {
  try {
    return (Intl as any).supportedValuesOf("timeZone");
  } catch {
    return [
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Tokyo",
      "Asia/Kolkata", "Asia/Shanghai", "Australia/Sydney", "Pacific/Auckland",
      "UTC",
    ];
  }
}

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMEZONES = getTimezones();

interface ScheduleSectionProps {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
}

export function ScheduleSection({ settings, onUpdate }: ScheduleSectionProps) {
  const resetTime  = settings.dailyResetTime;
  const weeklyDay  = settings.weeklyResetDay;
  const timezone   = settings.timezone;

  return (
    <div className="settings-section" id="settings-schedule">
      <h2 className="settings-section__header t-label">[ SCHEDULE ]</h2>

      <div className="settings-section__content">
        {/* Daily Reset Time */}
        <div className="settings-row">
          <div className="settings-row__label">
            <Clock size={14} strokeWidth={1.5} />
            <span className="t-body">Daily Reset Time</span>
          </div>
          <TimeInput
            id="schedule-daily-reset"
            value={resetTime}
            onChange={(v) => onUpdate({ dailyResetTime: v })}
          />
        </div>

        {/* Weekly Reset Day */}
        <div className="settings-row">
          <div className="settings-row__label">
            <CalendarDays size={14} strokeWidth={1.5} />
            <span className="t-body">Weekly Reset Day</span>
          </div>
          <select
            className="settings-select"
            value={weeklyDay}
            onChange={(e) => onUpdate({ weeklyResetDay: Number(e.target.value) })}
          >
            {DAYS_OF_WEEK.map((day, i) => (
              <option key={i} value={i}>{day}</option>
            ))}
          </select>
        </div>

        {/* Timezone */}
        <div className="settings-row">
          <div className="settings-row__label">
            <Globe size={14} strokeWidth={1.5} />
            <span className="t-body">Timezone</span>
          </div>
          <select
            className="settings-select"
            value={timezone}
            onChange={(e) => onUpdate({ timezone: e.target.value })}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
