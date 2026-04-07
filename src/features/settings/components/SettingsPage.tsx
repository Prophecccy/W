import { AccountSection } from "./AccountSection";
import { AppearanceSection } from "./AppearanceSection";
import { DesktopSection } from "./DesktopSection";
import { ScheduleSection } from "./ScheduleSection";
import { NotificationsSection } from "./NotificationsSection";
import { DataSection } from "./DataSection";
import { GroupManager } from "./GroupManager/GroupManager";
import { ManualFreezeToggle } from "../../freeze/components/ManualFreezeToggle";
import { UndoHistory } from "./UndoHistory/UndoHistory";
import { WallpaperPicker } from "../../wallpaper/components/WallpaperPicker/WallpaperPicker";
import "./SettingsPage.css";

export function SettingsPage() {
  return (
    <div className="settings-page">
      <h1 className="settings-page__title t-display">[ SETTINGS ]</h1>
      <p className="settings-page__subtitle t-meta">CONFIGURATION</p>

      {/* Account */}
      <AccountSection />

      <hr className="settings-divider" />

      {/* Appearance */}
      <AppearanceSection />

      <hr className="settings-divider" />

      {/* Desktop & Widget */}
      <DesktopSection />

      <hr className="settings-divider" />

      {/* Wallpapers */}
      <div className="settings-section" id="settings-wallpapers">
        <h2 className="settings-section__header t-label">[ WALLPAPERS ]</h2>
        <div className="settings-section__content">
          <WallpaperPicker />
        </div>
      </div>

      <hr className="settings-divider" />

      {/* Schedule */}
      <ScheduleSection />

      <hr className="settings-divider" />

      {/* Notifications */}
      <NotificationsSection />

      <hr className="settings-divider" />

      {/* Data Management */}
      <DataSection />

      <hr className="settings-divider" />

      {/* Groups */}
      <div className="settings-section" id="settings-groups">
        <h2 className="settings-section__header t-label">[ GROUPS ]</h2>
        <div className="settings-section__content">
          <GroupManager />
        </div>
      </div>

      <hr className="settings-divider" />

      {/* Freeze */}
      <div className="settings-section" id="settings-freeze">
        <h2 className="settings-section__header t-label">[ FREEZE ]</h2>
        <div className="settings-section__content">
          <ManualFreezeToggle />
        </div>
      </div>

      <hr className="settings-divider" />

      {/* Undo History */}
      <UndoHistory />
    </div>
  );
}
