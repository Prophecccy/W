import { useState, FormEvent, useEffect } from "react";
import { useAuthContext } from "../context";
import { createUserDoc } from "../services/userService";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../../shared/components/Toast/Toast";
import { db, doc, updateDoc } from "../../../shared/config/firebase";
import { TimeInput } from "../../../shared/components/RadialTimePicker/TimeInput";
import "./OnboardingPage.css";

interface OnboardingProps {
  onComplete: () => Promise<void>;
}

export function OnboardingPage({ onComplete }: OnboardingProps) {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  const [appWindow, setAppWindow] = useState<any>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (isTauri) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        setAppWindow(getCurrentWindow());
      }).catch(console.error);
    }
  }, [isTauri]);

  // Wizard state values
  const [step, setStep] = useState(1);
  const [accent, setAccent] = useState("#5B8DEF");
  const [resetTime, setResetTime] = useState("04:00");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [sleepTime, setSleepTime] = useState("23:00");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleFinish = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      // SINGLE ATOMIC WRITE: createUserDoc uses setDoc
      const newDoc = await createUserDoc(user.uid, user.email, user.displayName, user.photoURL, {
        dailyResetTime: resetTime,
        timezone: defaultTz,
        wakeUpTime: wakeTime,
        bedTime: sleepTime,
      });

      // Apply chosen accent color to all aesthetics targets
      await updateDoc(doc(db, "users", user.uid), {
        "aesthetics.widget.accentColor": accent,
        "aesthetics.mobile.accentColor": accent,
        "aesthetics.desktop.accentColor": accent,
      });

      console.log("[Onboarding] User doc created successfully:", newDoc.uid);

      // Brief stabilization delay
      await new Promise((resolve) => setTimeout(resolve, 350));

      // Notify Layout to reload store and transition
      await onComplete();

      navigate("/");
      showToast("[ ONBOARDING_COMPLETE ] - Operating parameters established.");
    } catch (error) {
      console.error("[Onboarding] handleFinish FAILED. Error:", error);
      showToast("Error establishing preferences. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handleDrag = (e: React.PointerEvent) => {
    // Allow dragging from any non-interactive element
    if (e.target instanceof Element && (
      e.target.closest('button') ||
      e.target.closest('input') ||
      e.target.closest('a')
    )) return;
    
    if (isTauri) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().startDragging();
      }).catch(console.error);
    }
  };

  return (
    <div className="onboarding" onPointerDown={handleDrag}>
      <div className="onboarding__controls">
        <button 
          className="onboarding__close-btn t-label" 
          onClick={() => appWindow?.close()}
        >
          [ X ]
        </button>
      </div>

      <div className="onboarding__container">
        <div className="onboarding__header">
          <div className="onboarding__step-indicator t-meta">
            STEP {step} OF 2
          </div>
          <h1 className="t-display">
            {step === 1 ? "[ CORE CONFIGURATION ]" : "[ FUEL CALIBRATION ]"}
          </h1>
          <p className="t-meta onboarding__subtitle">
            {step === 1 
              ? "SET YOUR ACCENT COLOR AND WORKDAY TRANSITION PREFERENCES."
              : "SET YOUR STANDARD OPERATING CYCLE. THIS CALIBRATES YOUR DASHBOARD FUEL GAUGE."
            }
          </p>
        </div>

        <form className="onboarding__form" onSubmit={handleFinish}>
          {step === 1 && (
            <div className="onboarding__step-content fade-in">
              <div className="form-group">
                <label className="t-label">ACCENT COLOR</label>
                <div className="color-options">
                   {["#5B8DEF", "#E8736C", "#4ade80", "#c084fc", "#fbbf24"].map((c) => (
                      <button
                         key={c}
                         type="button"
                         className={`color-btn ${accent === c ? 'color-btn--active' : ''}`}
                         style={{ background: c }}
                         onClick={() => setAccent(c)}
                      />
                   ))}
                   <input 
                      type="color" 
                      className="color-picker" 
                      value={accent} 
                      onChange={(e) => setAccent(e.target.value)} 
                   />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="t-label">DAILY RESET TIME</label>
                <p className="t-meta" style={{ marginBottom: 8, textTransform: "none", color: "var(--text-muted)" }}>
                   When do your daily habit counts and strikes reset? (Default: 04:00 AM)
                </p>
                <TimeInput 
                  value={resetTime}
                  onChange={(v) => setResetTime(v)}
                />
              </div>

              <div className="onboarding__footer" style={{ justifyContent: 'flex-end', marginTop: '32px' }}>
                <button 
                  type="button" 
                  className="onboarding__nav-btn t-label"
                  onClick={() => setStep(2)}
                >
                  [ NEXT ]
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding__step-content fade-in">
              <div className="onboarding__time-row">
                <div className="form-group">
                  <label className="t-label">[ WAKE TIME ]</label>
                  <TimeInput 
                    value={wakeTime}
                    onChange={(v) => setWakeTime(v)}
                  />
                </div>

                <div className="form-group">
                  <label className="t-label">[ BED TIME ]</label>
                  <TimeInput 
                    value={sleepTime}
                    onChange={(v) => setSleepTime(v)}
                  />
                </div>
              </div>

              <div className="onboarding__footer" style={{ marginTop: '48px' }}>
                <button 
                  type="button" 
                  className="onboarding__nav-btn t-label"
                  onClick={() => setStep(1)}
                >
                  [ BACK ]
                </button>
                <button 
                  type="submit" 
                  className="onboarding__submit-btn t-label"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "[ INITIALIZING... ]" : "[ COMPLETE SETUP ]"}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
