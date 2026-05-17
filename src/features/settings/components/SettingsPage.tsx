import { useState, useEffect, useMemo } from "react";
import { useUserStore } from "../../../shared/stores/userStore";
import { Settings, Aesthetics } from "../../../shared/types";
import { AccountSection } from "./AccountSection";
import { AppearanceSection } from "./AppearanceSection";
import { DesktopSection } from "./DesktopSection";
import { ScheduleSection } from "./ScheduleSection";
import { NotificationsSection } from "./NotificationsSection";
import { DataSection } from "./DataSection";
import { ManualFreezeToggle } from "../../freeze/components/ManualFreezeToggle";
import { UndoHistory } from "./UndoHistory/UndoHistory";
import { WallpaperPicker } from "../../wallpaper/components/WallpaperPicker/WallpaperPicker";
import { Save, RotateCcw, User, Palette, Monitor, Clock, Bell, HardDrive } from "lucide-react";

import "./SettingsPage.css";

type TabId = "account" | "appearance" | "desktop" | "schedule" | "notifications" | "data";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const TABS: TabConfig[] = [
  { id: "account", label: "ACCOUNT", icon: User },
  { id: "appearance", label: "APPEARANCE", icon: Palette },
  { id: "desktop", label: "DESKTOP & WALLPAPERS", icon: Monitor },
  { id: "schedule", label: "SCHEDULE & TIME", icon: Clock },
  { id: "notifications", label: "NOTIFICATIONS", icon: Bell },
  { id: "data", label: "DATA & SYSTEM", icon: HardDrive }
];

export function SettingsPage() {
  const { userDoc, loading } = useUserStore();
  const [activeTab, setActiveTab] = useState<TabId>("account");
  const [draftSettings, setDraftSettings] = useState<Settings | null>(null);
  const [draftAesthetics, setDraftAesthetics] = useState<Aesthetics | null>(null);

  // Initialize draft when userDoc loads
  useEffect(() => {
    if (userDoc) {
      if (!draftSettings) setDraftSettings({ ...userDoc.settings });
      if (!draftAesthetics) setDraftAesthetics({ ...userDoc.aesthetics });
    }
  }, [userDoc, draftSettings, draftAesthetics]);

  // Check for unsaved changes
  const isDirty = useMemo(() => {
    if (!userDoc || !draftSettings || !draftAesthetics) return false;
    const settingsChanged = JSON.stringify(userDoc.settings) !== JSON.stringify(draftSettings);
    const aestheticsChanged = JSON.stringify(userDoc.aesthetics) !== JSON.stringify(draftAesthetics);
    return settingsChanged || aestheticsChanged;
  }, [userDoc, draftSettings, draftAesthetics]);

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
        // Refresh local store to match DB
        // We need to trigger a reload or manually update the store
      }
      
      // For now, let's use the updateSettings from store if it's easier, 
      // but it only handles Settings. I'll use direct updateUserDoc for both.
      
      // After save, we should ideally reload the user store
      window.location.reload(); // Hard reload for now to ensure sync, or use store.reload()
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  const handleDiscard = () => {
    if (userDoc) {
      setDraftSettings({ ...userDoc.settings });
      setDraftAesthetics({ ...userDoc.aesthetics });
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
      case "schedule":
        return <ScheduleSection settings={draftSettings} onUpdate={handleUpdateDraft} />;
      case "notifications":
        return <NotificationsSection />;
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
              onClick={() => setActiveTab(id)}
            >
              <Icon size={16} className="settings-tab__icon" />
              <span>{label}</span>
            </button>
          ))}
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
