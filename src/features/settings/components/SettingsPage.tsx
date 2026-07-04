import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useUserStore } from "../../../shared/stores/userStore";
import { Settings, Aesthetics } from "../../../shared/types";
import { AccountSection } from "./AccountSection";
import { AppearanceSection } from "./AppearanceSection";
import { DesktopSection } from "./DesktopSection";
import { ScheduleSection } from "./ScheduleSection";
import { SleepTubeSection } from "./SleepTubeSection";
import { NotificationsSection } from "./NotificationsSection";
import { DataSection } from "./DataSection";
import { ManualFreezeToggle } from "../../freeze/components/ManualFreezeToggle";
import { UndoHistory } from "./UndoHistory/UndoHistory";
import { WallpaperPicker } from "../../wallpaper/components/WallpaperPicker/WallpaperPicker";
import { Save, RotateCcw, User, Palette, Monitor, Clock, Bell, HardDrive, LogOut } from "lucide-react";

import { useAuthContext } from "../../auth/context";

import "./SettingsPage.css";

type TabId = "account" | "appearance" | "desktop" | "sleep-tube" | "schedule" | "notifications" | "data";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const TABS: TabConfig[] = [
  { id: "account", label: "ACCOUNT", icon: User },
  { id: "appearance", label: "APPEARANCE", icon: Palette },
  { id: "desktop", label: "DESKTOP", icon: Monitor },
  { id: "sleep-tube", label: "SLEEP TUBE", icon: Clock },
  { id: "schedule", label: "SCHEDULE & TIME", icon: Clock },
  { id: "notifications", label: "NOTIFICATIONS", icon: Bell },
  { id: "data", label: "DATA & SYSTEM", icon: HardDrive }
];

const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  weekStartsOn: 1,
  dailyResetTime: "04:00",
  weeklyResetDay: 1,
  notifications: true,
  eveningNudge: true,
  strikeWarnings: true,
  lockoutAlert: true,
  weeklySummary: true,
  completionSound: true,
  predictiveWarnings: true,
  lowGraphicsMode: false,
  wakeUpTime: "07:00",
  bedTime: "23:00",
  emptyTubeText: "DEPLETED",
};

const DEFAULT_AESTHETICS: Aesthetics = {
  widget: { dimIntensity: 0.6, accentColor: "#5B8DEF" },
  mobile: { dimIntensity: 0.6, accentColor: "#5B8DEF" },
  desktop: { dimIntensity: 0.6, accentColor: "#5B8DEF" },
};

export function SettingsPage() {
  const { userDoc, loading } = useUserStore();
  const { signOut } = useAuthContext();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("account");
  const [draftSettings, setDraftSettings] = useState<Settings | null>(null);
  const [draftAesthetics, setDraftAesthetics] = useState<Aesthetics | null>(null);

  // Synchronize activeTab with URL tab query parameter if present
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get("tab") as TabId;
    if (tabParam && ["account", "appearance", "desktop", "sleep-tube", "schedule", "notifications", "data"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  const lastBaseSettings = useRef<Settings | null>(null);
  const lastBaseAesthetics = useRef<Aesthetics | null>(null);



  // Construct fully populated fallback states
  const baseSettings = useMemo(() => {
    if (!userDoc) return null;
    return { ...DEFAULT_SETTINGS, ...userDoc.settings };
  }, [userDoc]);

  const baseAesthetics = useMemo(() => {
    if (!userDoc) return null;
    return {
      widget: { ...DEFAULT_AESTHETICS.widget, ...userDoc.aesthetics?.widget },
      mobile: { ...DEFAULT_AESTHETICS.mobile, ...userDoc.aesthetics?.mobile },
      desktop: { ...DEFAULT_AESTHETICS.desktop, ...userDoc.aesthetics?.desktop },
    };
  }, [userDoc]);

  // Initialize or update draft settings when base state changes and user has not modified them
  useEffect(() => {
    if (baseSettings && baseAesthetics) {
      const isFirstLoad = !lastBaseSettings.current;
      
      if (isFirstLoad) {
        setDraftSettings(JSON.parse(JSON.stringify(baseSettings)));
        setDraftAesthetics(JSON.parse(JSON.stringify(baseAesthetics)));
      } else {
        const baseSettingsChanged = JSON.stringify(baseSettings) !== JSON.stringify(lastBaseSettings.current);
        const baseAestheticsChanged = JSON.stringify(baseAesthetics) !== JSON.stringify(lastBaseAesthetics.current);
        
        const settingsClean = JSON.stringify(draftSettings) === JSON.stringify(lastBaseSettings.current);
        const aestheticsClean = JSON.stringify(draftAesthetics) === JSON.stringify(lastBaseAesthetics.current);

        if (baseSettingsChanged && settingsClean) {
          setDraftSettings(JSON.parse(JSON.stringify(baseSettings)));
        }
        if (baseAestheticsChanged && aestheticsClean) {
          setDraftAesthetics(JSON.parse(JSON.stringify(baseAesthetics)));
        }
      }

      lastBaseSettings.current = baseSettings;
      lastBaseAesthetics.current = baseAesthetics;
    }
  }, [baseSettings, baseAesthetics]);

  // Check for unsaved changes
  const isDirty = useMemo(() => {
    if (!baseSettings || !baseAesthetics || !draftSettings || !draftAesthetics) return false;
    const settingsChanged = JSON.stringify(baseSettings) !== JSON.stringify(draftSettings);
    const aestheticsChanged = JSON.stringify(baseAesthetics) !== JSON.stringify(draftAesthetics);
    return settingsChanged || aestheticsChanged;
  }, [baseSettings, baseAesthetics, draftSettings, draftAesthetics]);

  // Revert color preview on unmount if changes were discarded/unsaved
  useEffect(() => {
    return () => {
      // Clear real-time aesthetics previews in widget window on unmount
      const channel = new BroadcastChannel('w_channel');
      channel.postMessage({ type: 'CLEAR_AESTHETICS_PREVIEW' });
      channel.close();

      if (baseSettings && baseAesthetics) {
        const savedColor = baseAesthetics.desktop.accentColor;
        document.documentElement.style.setProperty("--accent", savedColor);
        
        const savedLowGraphics = baseSettings.lowGraphicsMode;
        if (savedLowGraphics) {
          document.body.classList.add("low-graphics");
        } else {
          document.body.classList.remove("low-graphics");
        }

        try {
          import("@tauri-apps/api/event").then(({ emit }) => {
            emit("color-preview", savedColor).catch(() => {});
          }).catch(() => {});
        } catch {}
      }
    };
  }, [baseSettings, baseAesthetics]);

  // Prevent accidental unload if changes are unsaved
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "You have unsaved settings changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  const handleUpdateDraft = (patch: Partial<Settings>) => {
    setDraftSettings(prev => prev ? { ...prev, ...patch } : null);
  };

  const handleUpdateAesthetics = (patch: Partial<Aesthetics>) => {
    setDraftAesthetics((prev: Aesthetics | null) => {
      if (!prev) return null;
      return { ...prev, ...patch };
    });
  };

  const handleSave = async () => {
    if (!draftSettings || !draftAesthetics || !userDoc || !baseSettings || !baseAesthetics) return;
    try {
      const updates: any = {};
      
      // Patch settings
      Object.entries(draftSettings).forEach(([key, val]) => {
        if (val !== (baseSettings as any)[key]) {
          updates[`settings.${key}`] = val;
        }
      });

      // Patch aesthetics
      Object.entries(draftAesthetics).forEach(([key, val]) => {
        if (JSON.stringify(val) !== JSON.stringify((baseAesthetics as any)[key])) {
          updates[`aesthetics.${key}`] = val;
        }
      });

      if (Object.keys(updates).length > 0) {
        const { updateUserDoc } = await import("../../auth/services/userService");
        await updateUserDoc(userDoc.uid, updates);
      }

      // Notify widget to clear preview and load saved values
      const channel = new BroadcastChannel('w_channel');
      channel.postMessage({ type: 'CLEAR_AESTHETICS_PREVIEW' });
      channel.close();
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  const handleDiscard = () => {
    if (baseSettings && baseAesthetics) {
      // Revert accent color previews instantly
      const savedColor = baseAesthetics.desktop.accentColor;
      document.documentElement.style.setProperty("--accent", savedColor);

      const savedLowGraphics = baseSettings.lowGraphicsMode;
      if (savedLowGraphics) {
        document.body.classList.add("low-graphics");
      } else {
        document.body.classList.remove("low-graphics");
      }

      try {
        import("@tauri-apps/api/event").then(({ emit }) => {
          emit("color-preview", savedColor).catch(() => {});
        }).catch(() => {});
      } catch {}

      setDraftSettings(JSON.parse(JSON.stringify(baseSettings)));
      setDraftAesthetics(JSON.parse(JSON.stringify(baseAesthetics)));

      // Notify widget to clear preview and revert to base
      const channel = new BroadcastChannel('w_channel');
      channel.postMessage({ type: 'CLEAR_AESTHETICS_PREVIEW' });
      channel.close();
    }
  };

  if (loading || !draftSettings || !draftAesthetics) {
    return <div className="settings-page--loading t-meta">[ INITIALIZING DATA... ]</div>;
  }

  const renderContent = () => {
    switch (activeTab) {
      case "account":
        return <AccountSection />;
      case "appearance":
        return (
          <>
            <AppearanceSection 
              settings={draftSettings} 
              onUpdate={handleUpdateDraft}
              aesthetics={draftAesthetics}
              onUpdateAesthetics={handleUpdateAesthetics}
            />
            <div className="settings-section" id="settings-wallpapers">
              <h2 className="settings-section__header t-label">[ WALLPAPERS ]</h2>
              <div className="settings-section__content">
                <WallpaperPicker 
                  aesthetics={draftAesthetics} 
                  onUpdateAesthetics={handleUpdateAesthetics} 
                />
              </div>
            </div>
          </>
        );
      case "desktop":
        return <DesktopSection />;
      case "sleep-tube":
        return <SleepTubeSection settings={draftSettings} onUpdate={handleUpdateDraft} />;
      case "schedule":
        return <ScheduleSection settings={draftSettings} onUpdate={handleUpdateDraft} />;
      case "notifications":
        return <NotificationsSection settings={draftSettings} onUpdate={handleUpdateDraft} />;
      case "data":
        return (
          <>
            <DataSection />
            <div className="settings-column">
              <div className="settings-section" id="settings-freeze">
                <h2 className="settings-section__header t-label">[ FREEZE ]</h2>
                <div className="settings-section__content">
                  <ManualFreezeToggle />
                </div>
              </div>
              <UndoHistory />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-page__layout">
        <div className="settings-sidebar">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`settings-tab ${activeTab === id ? "active" : ""}`}
              onClick={() => {
                if (isDirty) {
                  if (!confirm("You have unsaved changes. Change tabs anyway? Your unsaved changes will be discarded.")) {
                    return;
                  }
                  handleDiscard();
                }
                setActiveTab(id);
              }}
            >
              <Icon size={16} className="settings-tab__icon" />
              <span>{label}</span>
            </button>
          ))}
          
          <button
            className="settings-tab settings-tab--logout t-label"
            onClick={async () => {
              if (isDirty) {
                if (!confirm("You have unsaved changes. Sign out anyway?")) {
                  return;
                }
              }
              if (confirm("Are you sure you want to sign out?")) {
                await signOut();
              }
            }}
          >
            <LogOut size={16} className="settings-tab__icon" style={{ color: "var(--strike-red)" }} />
            <span>[ LOG OUT ]</span>
          </button>
        </div>

        <div className="settings-content">
          {renderContent()}
        </div>
      </div>

      {/* Floating Action Bar */}
      {isDirty && (
        <div className="settings-action-bar animate-pulse">
          <div className="settings-action-bar__info">
            <span className="t-meta">[ UNSAVED CHANGES DETECTED ]</span>
          </div>
          <div className="settings-action-bar__actions">
            <button className="btn-action btn-action--secondary" onClick={handleDiscard}>
              <RotateCcw size={14} />
              DISCARD
            </button>
            <button className="btn-action btn-action--primary" onClick={handleSave}>
              <Save size={14} />
              SAVE CHANGES
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
