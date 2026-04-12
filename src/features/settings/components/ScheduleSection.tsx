import { useState, useEffect, useRef } from "react";
import { useAuthContext } from "../../auth/context";
import { getUserDoc, updateUserDoc } from "../../auth/services/userService";
import { useToast } from "../../../shared/components/Toast/Toast";
import { Clock, CalendarDays, Globe, Sunrise, Moon } from "lucide-react";

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

export function ScheduleSection() {
  const { user } = useAuthContext();
  const { showToast } = useToast();
  const [resetTime, setResetTime] = useState("04:00");
  const [weeklyDay, setWeeklyDay] = useState(1);
  const [timezone, setTimezone] = useState("UTC");
  const [wakeUpTime, setWakeUpTime] = useState("07:00");
  const [bedTime, setBedTime] = useState("23:00");
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((doc) => {
        if (doc) {
          setResetTime(doc.settings.dailyResetTime);
          setWeeklyDay(doc.settings.weeklyResetDay);
          setTimezone(doc.settings.timezone);
          setWakeUpTime(doc.settings.wakeUpTime ?? "07:00");
          setBedTime(doc.settings.bedTime ?? "23:00");
          setLoaded(true);
        }
      });
    }
  }, [user]);

  const saveField = (field: string, value: unknown) => {
    if (!user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await updateUserDoc(user.uid, {
          [`settings.${field}`]: value,
        } as any);
      } catch {
        showToast("[ FAILED TO SAVE ]");
      }
    }, 500);
  };

  if (!loaded) return null;

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
          <input
            type="time"
            className="settings-input"
            value={resetTime}
            onChange={(e) => {
              setResetTime(e.target.value);
              saveField("dailyResetTime", e.target.value);
            }}
          />
        </div>

        {/* Wake-Up Time */}
        <div className="settings-row">
          <div className="settings-row__label">
            <Sunrise size={14} strokeWidth={1.5} />
            <span className="t-body">Wake-Up Time</span>
          </div>
          <input
            type="time"
            className="settings-input"
            value={wakeUpTime}
            onChange={(e) => {
              setWakeUpTime(e.target.value);
              saveField("wakeUpTime", e.target.value);
            }}
          />
        </div>

        {/* Bed Time */}
        <div className="settings-row">
          <div className="settings-row__label">
            <Moon size={14} strokeWidth={1.5} />
            <span className="t-body">Bed Time</span>
          </div>
          <input
            type="time"
            className="settings-input"
            value={bedTime}
            onChange={(e) => {
              setBedTime(e.target.value);
              saveField("bedTime", e.target.value);
            }}
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
            onChange={(e) => {
              const val = Number(e.target.value);
              setWeeklyDay(val);
              saveField("weeklyResetDay", val);
            }}
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
            onChange={(e) => {
              setTimezone(e.target.value);
              saveField("timezone", e.target.value);
            }}
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
