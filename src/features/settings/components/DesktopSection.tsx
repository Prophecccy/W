import { Monitor, RefreshCw, Download, Move } from "lucide-react";
import { isTauri, openExternalLink } from "../../../shared/utils/tauri";
import { resetWidgetPosition } from "../../widget/services/widgetPositionStore";
import { useToast } from "../../../shared/components/Toast/Toast";
import "./DesktopSection.css";

export function DesktopSection() {
  const { showToast } = useToast();
  const inTauri = isTauri();

  const handleResetPosition = async () => {
    await resetWidgetPosition();
    showToast("[ WIDGET POSITION RESET ]");
    // Trigger a re-launch to apply the reset position if it's already open
    window.dispatchEvent(new CustomEvent("w:launch-widget"));
  };

  const handleRelaunch = () => {
    window.dispatchEvent(new CustomEvent("w:launch-widget"));
    showToast("[ RE-LAUNCHING WIDGET... ]");
  };

  if (!inTauri) {
    return (
      <div className="settings-section" id="settings-desktop">
        <h2 className="settings-section__header t-label">[ DESKTOP & WIDGET ]</h2>
        <div className="settings-section__content">
          <div className="desktop-card">
            <div className="desktop-card__header">
              <div className="desktop-card__icon">
                <Monitor size={24} />
              </div>
              <span className="desktop-card__title">Get the [ W ] Desktop Experience</span>
            </div>
            
            <p className="desktop-card__desc t-body">
              For the full experience, download the desktop application. It includes our unique 
              <strong> Always-on-Desktop Widget</strong> that stays pinned behind your windows.
            </p>

            <div className="desktop-card__features">
              <span className="desktop-feature-tag">Always-on-Desktop Widget</span>
              <span className="desktop-feature-tag">Global Hotkeys</span>
              <span className="desktop-feature-tag">Offline Support</span>
              <span className="desktop-feature-tag">Low System Impact</span>
            </div>

            <button 
              className="desktop-btn--hero"
              onClick={() => openExternalLink("https://github.com/Prophecccy/W/releases/latest")}
            >
              <Download size={18} strokeWidth={2.5} />
              <span>DOWNLOAD FOR WINDOWS</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section" id="settings-desktop">
      <h2 className="settings-section__header t-label">[ DESKTOP & WIDGET ]</h2>
      <div className="settings-section__content">
        <div className="desktop-card">
          <div className="desktop-card__header">
            <div className="desktop-card__icon">
              <Monitor size={20} />
            </div>
            <span className="desktop-card__title">Desktop Environment Active</span>
          </div>

          <p className="desktop-card__desc t-meta">
            You are currently running the native desktop application. 
            Use the controls below to manage your widget windows.
          </p>

          <div className="desktop-controls">
            <button className="desktop-btn" onClick={handleRelaunch}>
              <RefreshCw size={14} />
              <span className="t-label">RE-LAUNCH WIDGET</span>
            </button>
            <button className="desktop-btn" onClick={handleResetPosition}>
              <Move size={14} />
              <span className="t-label">RESET WIDGET POSITION</span>
            </button>
            <button 
              className="desktop-btn" 
              onClick={() => {
                showToast("[ CHECKING FOR UPDATES... ]");
                window.dispatchEvent(new CustomEvent("w:check-update"));
              }}
            >
              <RefreshCw size={14} />
              <span className="t-label">CHECK FOR UPDATES</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
