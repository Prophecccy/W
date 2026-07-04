import { useState } from "react";
import { useAuthContext } from "../context";
import { createUserDoc } from "../services/userService";
import { useNavigate } from "react-router-dom";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useToast } from "../../../shared/components/Toast/Toast";
import { TimeInput } from "../../../shared/components/RadialTimePicker/TimeInput";
import "./OnboardingFlow.css";

interface OnboardingFlowProps {
  onComplete?: () => Promise<void>;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { user, error, signingIn, signIn, signOut, clearError, devSkip } = useAuthContext();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  const appWindow = isTauri ? getCurrentWindow() : null;

  // Onboarding parameters state
  const [step, setStep] = useState(1);
  const [wakeTime, setWakeTime] = useState("07:00");
  const [sleepTime, setSleepTime] = useState("23:00");
  const [resetTime, setResetTime] = useState("04:00");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Highlighting active features on Step 2
  const [hoveredProtocol, setHoveredProtocol] = useState<number | null>(null);

  const handleDrag = (e: React.PointerEvent) => {
    // Allow dragging from any non-interactive element
    if (e.target instanceof Element && (
      e.target.closest('button') ||
      e.target.closest('input') ||
      e.target.closest('a')
    )) return;
    try {
      getCurrentWindow().startDragging();
    } catch {
      // Ignore if not running in Tauri
    }
  };

  const handleCompleteSetup = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      // Perform atomic configuration write to Firestore
      const newDoc = await createUserDoc(user.uid, user.email, user.displayName, user.photoURL, {
        dailyResetTime: resetTime,
        timezone: defaultTz,
        wakeUpTime: wakeTime,
        bedTime: sleepTime,
      });

      console.log("[OnboardingFlow] User document created successfully:", newDoc.uid);
      
      // Brief stabilization delay to ensure smooth transition
      await new Promise((resolve) => setTimeout(resolve, 350));

      if (onComplete) {
        await onComplete();
      }

      navigate("/");
      showToast("[ SYSTEM_INITIALIZED ] - Tactical parameters established.");
    } catch (err) {
      console.error("[OnboardingFlow] handleCompleteSetup failed:", err);
      showToast("Error establishing preferences. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="onboarding-flow" onPointerDown={handleDrag}>
      {/* Absolute Window Header Controls */}
      <div className="onboarding-flow__controls">
        <button 
          className="onboarding-flow__close-btn t-label" 
          onClick={() => appWindow?.close()}
        >
          [ X ]
        </button>
      </div>

      <div className="onboarding-flow__container">
        {/* Dynamic Header */}
        <div className="onboarding-flow__header">
          <div className="onboarding-flow__step-indicator t-label">
            STEP {step} OF 5
          </div>
          <h1 className="onboarding-flow__title t-display">
            {step === 1 && "[ DEVELOPER BRIEFING ]"}
            {step === 2 && "[ CORE PROTOCOLS ]"}
            {step === 3 && "[ SECURITY PROTOCOL ]"}
            {step === 4 && "[ FUEL CALIBRATION ]"}
            {step === 5 && "[ SYSTEM INITIALIZATION ]"}
          </h1>
          <p className="onboarding-flow__subtitle t-meta">
            {step === 1 && "READ AND ACKNOWLEDGE OPERATIONAL MANIFESTO."}
            {step === 2 && "UNDERSTAND THE THREE CORE PILLARS OF THE W ARCHITECTURE."}
            {step === 3 && "VERIFY DATA PROTECTION AND TRANSPARENCY PRINCIPLES."}
            {step === 4 && "ESTABLISH DAILY TIME LIMITS AND STANDARD OPERATING CYCLE."}
            {step === 5 && "ESTABLISH AUTHENTICATED PROTOCOL LINK."}
          </p>
        </div>

        {/* Form Content / State Machine */}
        <div className="onboarding-flow__content">
          {/* STEP 1: Briefing Manifesto */}
          {step === 1 && (
            <div className="onboarding-flow__manifesto t-body">
              Disclaimer: I am a solo developer building [ W ]. I have absolutely zero interest in your personal data. This is a tool for extreme self-sovereignty, raw focus, and hard accountability. Everything is designed to keep you in the zone, with zero ads, tracking, or surveillance. It is just you and your code.
            </div>
          )}

          {/* STEP 2: Core Protocols */}
          {step === 2 && (
            <div className="onboarding-flow__protocols">
              {[
                {
                  id: 1,
                  name: "1. SLEEPTUBE",
                  desc: "Tactical offline audio/video focus engine. Curate and stream local or selected offline tracks for high-concentration coding blocks without algorithms or distractors.",
                },
                {
                  id: 2,
                  name: "2. TACTICAL WORKSPACE",
                  desc: "Complete desktop integration, overlays, and persistent focus HUD. Renders ambient tools like sticky notes and widgets directly embedded on your workspace background.",
                },
                {
                  id: 3,
                  name: "3. LOCKDOWN PROTOCOL",
                  desc: "Ultra-strict app blocking, focus metrics, and custom strike system. Detects and blocks blacklisted distractions. Fulfills strict penalties if boundaries are breached.",
                },
              ].map((protocol) => (
                <div
                  key={protocol.id}
                  className={`onboarding-flow__protocol-card ${
                    hoveredProtocol === protocol.id ? "onboarding-flow__protocol-card--active" : ""
                  }`}
                  onMouseEnter={() => setHoveredProtocol(protocol.id)}
                  onMouseLeave={() => setHoveredProtocol(null)}
                >
                  <div className="onboarding-flow__protocol-name t-label">
                    {protocol.name}
                  </div>
                  <div className="onboarding-flow__protocol-desc t-body">
                    {protocol.desc}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* STEP 3: Security Protocol Data Privacy Table */}
          {step === 3 && (
            <div className="onboarding-flow__table">
              {/* Header */}
              <div className="onboarding-flow__table-cell onboarding-flow__table-header t-label">DATA TYPE</div>
              <div className="onboarding-flow__table-cell onboarding-flow__table-header t-label">SYSTEM STORAGE</div>
              <div className="onboarding-flow__table-cell onboarding-flow__table-header t-label">TRANSPARENCY</div>

              {/* Row 1 */}
              <div className="onboarding-flow__table-cell t-data" style={{ color: "var(--text-primary)" }}>Local Storage</div>
              <div className="onboarding-flow__table-cell t-body">Stored fully locally on machine</div>
              <div className="onboarding-flow__table-cell t-body" style={{ color: "var(--accent)" }}>100% private, never leaves device.</div>

              {/* Row 2 */}
              <div className="onboarding-flow__table-cell t-data" style={{ color: "var(--text-primary)" }}>Sync Services</div>
              <div className="onboarding-flow__table-cell t-body">Google Drive (Secure self-sovereign sync)</div>
              <div className="onboarding-flow__table-cell t-body" style={{ color: "var(--accent)" }}>Direct client-side sync. Stored inside your own Drive container.</div>

              {/* Row 3 */}
              <div className="onboarding-flow__table-cell t-data" style={{ color: "var(--text-primary)" }}>System Usage</div>
              <div className="onboarding-flow__table-cell t-body">Zero analytics / No server transmission</div>
              <div className="onboarding-flow__table-cell t-body" style={{ color: "var(--accent)" }}>Strictly processed locally, absolute confidentiality.</div>
            </div>
          )}

          {/* STEP 4: Calibration Settings */}
          {step === 4 && (
            <div className="onboarding-flow__calibration">
              <div className="onboarding-flow__time-grid">
                <div className="onboarding-flow__form-group">
                  <label className="t-label">[ WAKE TIME ]</label>
                  <p className="onboarding-flow__input-desc t-meta">
                    ESTABLISH YOUR DAILY AWAKENING TIME.
                  </p>
                  <TimeInput
                    value={wakeTime}
                    onChange={(v) => setWakeTime(v)}
                  />
                </div>

                <div className="onboarding-flow__form-group">
                  <label className="t-label">[ BED TIME ]</label>
                  <p className="onboarding-flow__input-desc t-meta">
                    ESTABLISH YOUR SCHEDULED SLEEP TIMEOUT.
                  </p>
                  <TimeInput
                    value={sleepTime}
                    onChange={(v) => setSleepTime(v)}
                  />
                </div>
              </div>

              <div className="onboarding-flow__form-group" style={{ marginTop: "16px" }}>
                <label className="t-label">[ DAILY RESET TIME ]</label>
                <p className="onboarding-flow__input-desc t-meta">
                  TIME FOR THE ACCUMULATED STRIKES AND TARGET COUNTS TO RESET (DEFAULT 04:00 AM).
                </p>
                <TimeInput
                  value={resetTime}
                  onChange={(v) => setResetTime(v)}
                />
              </div>
            </div>
          )}

          {/* STEP 5: System Initialization (Auth) */}
          {step === 5 && (
            <div className="onboarding-flow__auth animate-pulse">
              {error && (
                <div className="onboarding-flow__auth-error t-meta" onClick={clearError}>
                  ⚠ {error} - CLICK TO DISMISS
                </div>
              )}

              {user ? (
                <>
                  <div className="t-body accent-text" style={{ fontSize: "14px", marginBottom: "12px", textAlign: "center" }}>
                    [ SYSTEM ACCREDITED: {user.email || "DEV_USER"} ]
                  </div>
                  <p className="t-meta" style={{ color: "var(--text-muted)", marginBottom: "24px", textAlign: "center" }}>
                    YOUR PREFERENCES AND PROTOCOLS ARE CONFIGURED. CLICK BELOW TO INITIALIZE AND LAUNCH WORKSPACE.
                  </p>
                  <button
                    className="onboarding-flow__auth-btn onboarding-flow__auth-btn--google t-label"
                    onClick={handleCompleteSetup}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "[ RUNNING ENGINE... ]" : "[ LAUNCH SYSTEM ]"}
                  </button>
                  {!isSubmitting && (
                    <button
                      className="onboarding-flow__auth-btn onboarding-flow__auth-btn--dev t-label"
                      onClick={async () => {
                        try {
                          await signOut();
                          navigate("/login");
                        } catch (err) {
                          console.error("[OnboardingFlow] Sign out failed:", err);
                        }
                      }}
                      style={{ marginTop: "12px", width: "100%", maxWidth: "320px" }}
                    >
                      [ SWITCH ACCOUNT ]
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    className="onboarding-flow__auth-btn onboarding-flow__auth-btn--google t-label"
                    onClick={signIn}
                    disabled={signingIn}
                    style={signingIn ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
                  >
                    {signingIn ? "[ INITIALIZING GOOGLE AUTH... ]" : "[ SIGN IN WITH GOOGLE ]"}
                  </button>

                  {window.location.hostname === "localhost" && (
                    <button
                      className="onboarding-flow__auth-btn onboarding-flow__auth-btn--dev t-label"
                      onClick={devSkip}
                      disabled={signingIn}
                    >
                      [ DEV-SKIP LOGIN ]
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Dynamic Footer Controls */}
        <div className="onboarding-flow__footer">
          {step === 1 ? (
            <button
              type="button"
              className="onboarding-flow__nav-btn t-label"
              onClick={async () => {
                try {
                  await signOut();
                  navigate("/login");
                } catch (err) {
                  console.error("[OnboardingFlow] Sign out failed:", err);
                }
              }}
              disabled={isSubmitting}
            >
              [ SWITCH ACCOUNT ]
            </button>
          ) : step > 1 && step < 5 ? (
            <button
              type="button"
              className="onboarding-flow__nav-btn t-label"
              onClick={() => setStep(step - 1)}
              disabled={isSubmitting}
            >
              [ BACK ]
            </button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <button
              type="button"
              className="onboarding-flow__nav-btn onboarding-flow__nav-btn--primary t-label"
              onClick={() => setStep(step + 1)}
            >
              {step === 1 ? "[ PROCEED ]" : step === 3 ? "[ AGREE & PROCEED ]" : "[ NEXT ]"}
            </button>
          ) : (
            // In step 5, back navigation is allowed unless submitting user doc
            !isSubmitting && (
              <button
                type="button"
                className="onboarding-flow__nav-btn t-label"
                onClick={() => setStep(4)}
              >
                [ BACK ]
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
