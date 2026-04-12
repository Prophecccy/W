import { useState, useEffect } from "react";
import { useAuthContext } from "../../auth/context";
import { getUserDoc, updateUserDoc } from "../../auth/services/userService";
import { useToast } from "../../../shared/components/Toast/Toast";
import { Bell, BellOff, Moon, AlertTriangle, Lock, BarChart3, Timer } from "lucide-react";

interface NotifToggle {
  key: string;
  label: string;
  icon: React.ReactNode;
}

const TOGGLES: NotifToggle[] = [
  { key: "eveningNudge", label: "Evening Nudge", icon: <Moon size={14} strokeWidth={1.5} /> },
  { key: "strikeWarnings", label: "Strike Warnings", icon: <AlertTriangle size={14} strokeWidth={1.5} /> },
  { key: "lockoutAlert", label: "Lockout Alert", icon: <Lock size={14} strokeWidth={1.5} /> },
  { key: "weeklySummary", label: "Weekly Summary", icon: <BarChart3 size={14} strokeWidth={1.5} /> },
  { key: "timeLeftNudges", label: "Time Left Nudges", icon: <Timer size={14} strokeWidth={1.5} /> },
];

export function NotificationsSection() {
  const { user } = useAuthContext();
  const { showToast } = useToast();
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [settings, setSettings] = useState<Record<string, boolean>>({
    eveningNudge: true,
    strikeWarnings: true,
    lockoutAlert: true,
    weeklySummary: true,
    timeLeftNudges: true,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((doc) => {
        if (doc) {
          setMasterEnabled(doc.settings.notifications);
          setSettings({
            eveningNudge: doc.settings.eveningNudge,
            strikeWarnings: doc.settings.strikeWarnings,
            lockoutAlert: doc.settings.lockoutAlert,
            weeklySummary: doc.settings.weeklySummary,
            timeLeftNudges: (doc.settings as any).timeLeftNudges ?? true,
          });
          setLoaded(true);
        }
      });
    }
  }, [user]);

  const handleMasterToggle = async () => {
    const newVal = !masterEnabled;
    setMasterEnabled(newVal);
    if (user) {
      try {
        await updateUserDoc(user.uid, {
          "settings.notifications": newVal,
        } as any);
      } catch {
        showToast("[ FAILED TO SAVE ]");
        setMasterEnabled(!newVal);
      }
    }
  };

  const handleToggle = async (key: string) => {
    if (!masterEnabled) return;
    const newVal = !settings[key];
    setSettings((prev) => ({ ...prev, [key]: newVal }));
    if (user) {
      try {
        await updateUserDoc(user.uid, {
          [`settings.${key}`]: newVal,
        } as any);
      } catch {
        showToast("[ FAILED TO SAVE ]");
        setSettings((prev) => ({ ...prev, [key]: !newVal }));
      }
    }
  };

  if (!loaded) return null;

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
