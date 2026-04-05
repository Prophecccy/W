import { useState } from "react";
import { useAuthContext } from "../context";
import { createUserDoc, updateUserDoc } from "../services/userService";
import "./OnboardingPage.css";

interface OnboardingProps {
  onComplete: () => void;
}

export function OnboardingPage({ onComplete }: OnboardingProps) {
  const { user } = useAuthContext();
  const [resetTime, setResetTime] = useState("04:00");
  const [accent, setAccent] = useState("#5B8DEF");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      await createUserDoc(user.uid, user.email, user.displayName, user.photoURL, {
        dailyResetTime: resetTime,
        timezone: defaultTz,
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
          Let's configure your core preferences.
        </p>

        <form className="onboarding__form" onSubmit={handleSubmit}>
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

          <button 
             type="submit" 
             className="onboarding__submit t-label"
             disabled={isSubmitting}
          >
            {isSubmitting ? "[ SAVING... ]" : "[ CONTINUE ]"}
          </button>
        </form>
      </div>
    </div>
  );
}
