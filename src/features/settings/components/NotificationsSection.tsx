import { Settings } from "../../../shared/types";
import { Bell, BellOff, Moon, AlertTriangle, Lock, BarChart3, BrainCircuit } from "lucide-react";

interface NotifToggle {
  key: keyof Settings;
  label: string;
  icon: React.ReactNode;
}

const TOGGLES: NotifToggle[] = [
  { key: "eveningNudge", label: "Evening Nudge", icon: <Moon size={14} strokeWidth={1.5} /> },
  { key: "strikeWarnings", label: "Strike Warnings", icon: <AlertTriangle size={14} strokeWidth={1.5} /> },
  { key: "lockoutAlert", label: "Lockout Alert", icon: <Lock size={14} strokeWidth={1.5} /> },
  { key: "weeklySummary", label: "Weekly Summary", icon: <BarChart3 size={14} strokeWidth={1.5} /> },
  { key: "predictiveWarnings", label: "Predictive Warnings", icon: <BrainCircuit size={14} strokeWidth={1.5} /> },
];

interface NotificationsSectionProps {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
}

export function NotificationsSection({ settings, onUpdate }: NotificationsSectionProps) {
  const masterEnabled = settings.notifications;

  const handleMasterToggle = () => {
    onUpdate({ notifications: !masterEnabled });
  };

  const handleToggle = (key: keyof Settings) => {
    if (!masterEnabled) return;
    onUpdate({ [key]: !settings[key] });
  };

  return (
    <div className="settings-section" id="settings-notifications">
      <h2 className="settings-section__header t-label">[ NOTIFICATIONS ]</h2>

      <div className="settings-section__content">
        {/* Master Toggle */}
        <div className="settings-row settings-row--master">
          <div className="settings-row__label">
            {masterEnabled ? (
              <Bell size={14} strokeWidth={1.5} />
            ) : (
              <BellOff size={14} strokeWidth={1.5} />
            )}
            <span className="t-body">All Notifications</span>
          </div>
          <button
            className={`settings-toggle ${masterEnabled ? "settings-toggle--on" : ""}`}
            onClick={handleMasterToggle}
            aria-label="Toggle all notifications"
          >
            <span className="settings-toggle__knob" />
          </button>
        </div>

        {/* Sub-toggles */}
        <div className={`settings-notif-sub ${!masterEnabled ? "settings-notif-sub--disabled" : ""}`}>
          {TOGGLES.map((t) => (
            <div key={t.key} className="settings-row">
              <div className="settings-row__label">
                {t.icon}
                <span className="t-body">{t.label}</span>
              </div>
              <button
                className={`settings-toggle ${settings[t.key] ? "settings-toggle--on" : ""}`}
                onClick={() => handleToggle(t.key)}
                disabled={!masterEnabled}
                aria-label={`Toggle ${t.label}`}
              >
                <span className="settings-toggle__knob" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
