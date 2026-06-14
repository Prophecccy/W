import { useState, useEffect, useMemo } from "react";
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
  { id: "desktop", label: "DESKTOP & WALLPAPERS", icon: Monitor },
  { id: "sleep-tube", label: "SLEEP TUBE", icon: Clock },
  { id: "schedule", label: "SCHEDULE & TIME", icon: Clock },
  { id: "notifications", label: "NOTIFICATIONS", icon: Bell },
  { id: "data", label: "DATA & SYSTEM", icon: HardDrive }
];

export function SettingsPage() {
  const { userDoc, loading } = useUserStore();
  const { signOut } = useAuthContext();
  const [activeTab, setActiveTab] = useState<TabId>("account");
  const [draftSettings, setDraftSettings] = useState<Settings | null>(null);
  const [draftAesthetics, setDraftAesthetics] = useState<Aesthetics | null>(null);

  // Initialize draft when userDoc loads
  useEffect(() => {
    if (userDoc) {
      if (!draftSettings) setDraftSettings(JSON.parse(JSON.stringify(userDoc.settings)));
      if (!draftAesthetics) setDraftAesthetics(JSON.parse(JSON.stringify(userDoc.aesthetics)));
    }
  }, [userDoc, draftSettings, draftAesthetics]);

  // Check for unsaved changes
  const isDirty = useMemo(() => {
    if (!userDoc || !draftSettings || !draftAesthetics) return false;
    const settingsChanged = JSON.stringify(userDoc.settings) !== JSON.stringify(draftSettings);
    const aestheticsChanged = JSON.stringify(userDoc.aesthetics) !== JSON.stringify(draftAesthetics);
    return settingsChanged || aestheticsChanged;
  }, [userDoc, draftSettings, draftAesthetics]);

  // Revert color preview on unmount if changes were discarded/unsaved
  useEffect(() => {
    return () => {
      if (userDoc) {
        const savedColor = userDoc.aesthetics.desktop.accentColor;
        document.documentElement.style.setProperty("--accent", savedColor);
        
        const savedLowGraphics = userDoc.settings.lowGraphicsMode;
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
  }, [userDoc]);

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
      // Handle deep patch for aesthetics if needed, or simple merge
      return { ...prev, ...patch };
    });
  };

  const handleSave = async () => {
    if (!draftSettings || !draftAesthetics || !userDoc) return;
    try {
      // Save both settings and aesthetics
      const updates: any = {};
      
      // Patch settings
      Object.entries(draftSettings).forEach(([key, val]) => {
        if (val !== (userDoc.settings as any)[key]) {
          updates[`settings.${key}`] = val;
        }
      });

      // Patch aesthetics
      Object.entries(draftAesthetics).forEach(([key, val]) => {
        if (JSON.stringify(val) !== JSON.stringify((userDoc.aesthetics as any)[key])) {
          updates[`aesthetics.${key}`] = val;
        }
      });

      if (Object.keys(updates).length > 0) {
        const { updateUserDoc } = await import("../../auth/services/userService");
        await updateUserDoc(userDoc.uid, updates);
      }
      
      setDraftSettings(null);
      setDraftAesthetics(null);
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  const handleDiscard = () => {
    if (userDoc) {
      // Revert accent color previews instantly
      const savedColor = userDoc.aesthetics.desktop.accentColor;
      document.documentElement.style.setProperty("--accent", savedColor);

      const savedLowGraphics = userDoc.settings.lowGraphicsMode;
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

      setDraftSettings(JSON.parse(JSON.stringify(userDoc.settings)));
      setDraftAesthetics(JSON.parse(JSON.stringify(userDoc.aesthetics)));
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
          <AppearanceSection 
            settings={draftSettings} 
            onUpdate={handleUpdateDraft}
            aesthetics={draftAesthetics}
            onUpdateAesthetics={handleUpdateAesthetics}
          />
        );
      case "desktop":
        return (
          <>
            <DesktopSection />
            <div className="settings-section" id="settings-wallpapers">
              <h2 className="settings-section__header t-label">[ WALLPAPERS ]</h2>
              <div className="settings-section__content">
                <WallpaperPicker />
              </div>
            </div>
          </>
        );
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
