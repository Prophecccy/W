import { useState, useEffect } from "react";
import { Monitor, RefreshCw, Download, Move, ArrowDownCircle, Power } from "lucide-react";
import { isTauri, openExternalLink } from "../../../shared/utils/tauri";
import { resetWidgetPosition } from "../../widget/services/widgetPositionStore";
import { useToast } from "../../../shared/components/Toast/Toast";
import { useUpdateManager } from "../../updater/hooks/useUpdateManager";
import "./DesktopSection.css";

export function DesktopSection() {
  const { showToast } = useToast();
  const { phase, startUpdate, reboot } = useUpdateManager();
  const [isChecking, setIsChecking] = useState(false);
  const [appVersion, setAppVersion] = useState("...");
  const [autostartEnabled, setAutostartEnabled] = useState(true);
  const inTauri = isTauri();

  useEffect(() => {
    if (inTauri) {
      import('@tauri-apps/api/app').then(({ getVersion }) => {
        getVersion().then(v => setAppVersion(`v${v}`));
      }).catch(() => setAppVersion('v?.?.?'));

      // Check actual autostart state from the plugin
      import('@tauri-apps/plugin-autostart').then(({ isEnabled }) => {
        isEnabled().then(enabled => setAutostartEnabled(enabled)).catch(() => setAutostartEnabled(true));
      }).catch(() => setAutostartEnabled(true));
    }
  }, [inTauri]);

  const handleAutostartToggle = async () => {
    if (!inTauri) return;
    try {
      const { enable, disable, isEnabled } = await import('@tauri-apps/plugin-autostart');
      if (autostartEnabled) {
        await disable();
        setAutostartEnabled(false);
        showToast("[ STARTUP DISABLED ]");
      } else {
        await enable();
        setAutostartEnabled(true);
        showToast("[ STARTUP ENABLED ]");
      }
    } catch {
      showToast("[ FAILED TO CHANGE STARTUP SETTING ]");
    }
  };

  const handleResetPosition = async () => {
    await resetWidgetPosition();
    showToast("[ WIDGET POSITION RESET ]");
    window.dispatchEvent(new CustomEvent("w:launch-widget"));
  };

  const handleRelaunch = () => {
    window.dispatchEvent(new CustomEvent("w:launch-widget"));
    showToast("[ RE-LAUNCHING WIDGET... ]");
  };

  const handleCheckUpdate = () => {
    setIsChecking(true);
    window.dispatchEvent(new CustomEvent("w:check-update"));
    // Reset the spinner after a few seconds regardless
    setTimeout(() => setIsChecking(false), 5000);
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

        {/* Widget Controls Card */}
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
          </div>

          {/* Launch on Startup Toggle */}
          <div className="desktop-startup-row">
            <div className="desktop-startup-row__label">
              <Power size={14} />
              <span className="t-body">Launch on Startup</span>
            </div>
            <button
              className={`settings-toggle ${autostartEnabled ? "settings-toggle--on" : ""}`}
              onClick={handleAutostartToggle}
              aria-label="Toggle launch on startup"
            >
              <span className="settings-toggle__knob" />
            </button>
          </div>
        </div>

        {/* Update Card — Visually Separate */}
        <div className="desktop-card desktop-card--update">
          <div className="desktop-card__header">
            <div className="desktop-card__icon desktop-card__icon--update">
              <ArrowDownCircle size={20} />
            </div>
            <div>
              <span className="desktop-card__title">Software Updates</span>
              <span className="desktop-card__version t-meta">{appVersion}</span>
            </div>
          </div>

          {phase === 'available' && (
            <p className="desktop-card__desc t-body" style={{ color: "var(--accent)" }}>
              A new version is available! Click below to download and install.
            </p>
          )}

          {phase === 'ready' && (
            <p className="desktop-card__desc t-body" style={{ color: "var(--accent)" }}>
              Update downloaded. Restart to apply.
            </p>
          )}

          <div className="desktop-controls">
            {phase === 'available' ? (
              <button className="desktop-btn desktop-btn--accent" onClick={startUpdate}>
                <Download size={14} />
                <span className="t-label">DOWNLOAD & INSTALL</span>
              </button>
            ) : phase === 'ready' ? (
              <button className="desktop-btn desktop-btn--accent" onClick={reboot}>
                <RefreshCw size={14} />
                <span className="t-label">RESTART NOW</span>
              </button>
            ) : (
              <button 
                className="desktop-btn" 
                onClick={handleCheckUpdate}
                disabled={isChecking || phase === 'checking'}
              >
                <RefreshCw size={14} className={(isChecking || phase === 'checking') ? 'spin-animation' : ''} />
                <span className="t-label">
                  {(isChecking || phase === 'checking') ? 'CHECKING...' : 'CHECK FOR UPDATES'}
                </span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
