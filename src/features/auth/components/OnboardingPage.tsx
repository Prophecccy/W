import { useState } from "react";
import { useAuthContext } from "../context";
import { createUserDoc, updateUserDoc } from "../services/userService";
import { TimeTubeSimple } from "../../time-tube/components/TimeTubeSimple/TimeTubeSimple";
import "./OnboardingPage.css";

interface OnboardingProps {
  onComplete: () => void;
}

export function OnboardingPage({ onComplete }: OnboardingProps) {
  const { user } = useAuthContext();
  const [step, setStep] = useState(1);
  const [resetTime, setResetTime] = useState("04:00");
  const [accent, setAccent] = useState("#5B8DEF");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [sleepTime, setSleepTime] = useState("23:00");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      setStep(2);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      await createUserDoc(user.uid, user.email, user.displayName, user.photoURL, {
        dailyResetTime: resetTime,
        timezone: defaultTz,
        wakeUpTime: wakeTime,
        bedTime: sleepTime,
      });
      await updateUserDoc(user.uid, {
        aesthetics: {
          widget: { dimIntensity: 0.6, accentColor: accent },
          mobile: { dimIntensity: 0.6, accentColor: accent },
          desktop: { dimIntensity: 0.6, accentColor: accent },
        },
      });
      onComplete();
    } catch (error) {
      console.error(error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding__container">
        <h1 className="t-display">[ WELCOME ]</h1>
        <p className="t-body" style={{ color: "var(--text-secondary)", marginBottom: 32 }}>
          {step === 1 ? "Let's configure your core preferences." : "Establish your operating cycle."}
        </p>

        <form className="onboarding__form" onSubmit={handleNext}>
          {step === 1 && (
            <>
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

              <div className="form-group">
                <label className="t-label">DAILY RESET TIME</label>
                <p className="t-meta" style={{ marginBottom: 8, textTransform: "none", color: "var(--text-muted)" }}>
                   When do your habits reset? (Default: 4:00 AM)
                </p>
                <input 
                  type="time" 
                  className="onboarding__input t-data"
                  value={resetTime}
                  onChange={(e) => setResetTime(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {step === 2 && (
            <div style={{ display: "flex", gap: "32px", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ flex: 1 }}>
                <div className="form-group">
                  <label className="t-label">[ WAKE_TIME ]</label>
                  <p className="t-meta" style={{ marginBottom: 8, textTransform: "none", color: "var(--text-muted)" }}>
                    Required for Waking Fuel calibration.
                  </p>
                  <input 
                    type="time" 
                    className="onboarding__input t-data"
                    value={wakeTime}
                    onChange={(e) => setWakeTime(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="t-label">[ SLEEP_TIME ]</label>
                  <p className="t-meta" style={{ marginBottom: 8, textTransform: "none", color: "var(--text-muted)" }}>
                    Required for Waking Fuel calibration.
                  </p>
                  <input 
                    type="time" 
                    className="onboarding__input t-data"
                    value={sleepTime}
                    onChange={(e) => setSleepTime(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div style={{ width: "60px", height: "180px", position: "relative", flexShrink: 0 }}>
                <TimeTubeSimple wakeUpTime={wakeTime} bedTime={sleepTime} accentColor={accent} />
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "16px", marginTop: "16px" }}>
            {step === 2 && (
              <button 
                type="button" 
                className="onboarding__submit t-label"
                style={{ background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)", width: "auto", padding: "0 24px" }}
                onClick={() => setStep(1)}
              >
                [ BACK ]
              </button>
            )}
            <button 
               type="submit" 
               className="onboarding__submit t-label"
               style={{ flex: 1 }}
               disabled={isSubmitting || (step === 2 && (!wakeTime || !sleepTime))}
            >
              {isSubmitting ? "[ SAVING... ]" : step === 1 ? "[ CONTINUE ]" : "[ FINISH ]"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
