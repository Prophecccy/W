import { useState } from "react";
import { AccountSection } from "./AccountSection";
import { AppearanceSection } from "./AppearanceSection";
import { DesktopSection } from "./DesktopSection";
import { ScheduleSection } from "./ScheduleSection";
import { NotificationsSection } from "./NotificationsSection";
import { DataSection } from "./DataSection";
import { LockdownSection } from "./LockdownSection";
import { ManualFreezeToggle } from "../../freeze/components/ManualFreezeToggle";
import { UndoHistory } from "./UndoHistory/UndoHistory";
import { WallpaperPicker } from "../../wallpaper/components/WallpaperPicker/WallpaperPicker";
import { isTauri } from "../../../shared/utils/tauri";
import "./SettingsPage.css";

type TabId = "account" | "appearance" | "desktop" | "schedule" | "notifications" | "lockdown" | "data";

export function SettingsPage() {
  const isDesktop = isTauri();
  const [activeTab, setActiveTab] = useState<TabId>("account");

  const renderContent = () => {
    switch (activeTab) {
      case "account":
        return <AccountSection />;
      case "appearance":
        return <AppearanceSection />;
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
        return <ScheduleSection />;
      case "notifications":
        return <NotificationsSection />;
      case "lockdown":
        return <LockdownSection />;
      case "data":
        return (
          <>
            <DataSection />
            <div className="settings-section" id="settings-freeze">
              <h2 className="settings-section__header t-label">[ FREEZE ]</h2>
              <div className="settings-section__content">
                <ManualFreezeToggle />
              </div>
            </div>
            <UndoHistory />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <h1 className="settings-page__title t-display">[ SETTINGS ]</h1>
        <p className="settings-page__subtitle t-meta">CONFIGURATION</p>
      </div>

      <div className="settings-page__layout">
        <div className="settings-sidebar">
          <button
            className={`settings-tab ${activeTab === "account" ? "active" : ""}`}
            onClick={() => setActiveTab("account")}
          >
            ACCOUNT
          </button>
          <button
            className={`settings-tab ${activeTab === "appearance" ? "active" : ""}`}
            onClick={() => setActiveTab("appearance")}
          >
            APPEARANCE
          </button>
          <button
            className={`settings-tab ${activeTab === "desktop" ? "active" : ""}`}
            onClick={() => setActiveTab("desktop")}
          >
            DESKTOP & WALLPAPERS
          </button>
          <button
            className={`settings-tab ${activeTab === "schedule" ? "active" : ""}`}
            onClick={() => setActiveTab("schedule")}
          >
            SCHEDULE & TIME
          </button>
          <button
            className={`settings-tab ${activeTab === "notifications" ? "active" : ""}`}
            onClick={() => setActiveTab("notifications")}
          >
            NOTIFICATIONS
          </button>
          {isDesktop && (
            <button
              className={`settings-tab ${activeTab === "lockdown" ? "active" : ""}`}
              onClick={() => setActiveTab("lockdown")}
            >
              🔒 LOCKDOWN
            </button>
          )}
          <button
            className={`settings-tab ${activeTab === "data" ? "active" : ""}`}
            onClick={() => setActiveTab("data")}
          >
            DATA & SYSTEM
          </button>
        </div>

        <div className="settings-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
