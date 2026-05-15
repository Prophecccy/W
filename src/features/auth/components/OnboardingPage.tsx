import { useState, FormEvent } from "react";
import { useAuthContext } from "../context";
import { createUserDoc } from "../services/userService";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../../shared/components/Toast/Toast";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../shared/config/firebase";
import "./OnboardingPage.css";

interface OnboardingProps {
  onComplete: () => Promise<void>;
}

export function OnboardingPage({ onComplete }: OnboardingProps) {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [resetTime, setResetTime] = useState("04:00");
  const [accent, setAccent] = useState("#5B8DEF");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleFinish = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      // SINGLE ATOMIC WRITE: createUserDoc uses setDoc (not updateDoc) so it always succeeds
      const newDoc = await createUserDoc(user.uid, user.email, user.displayName, user.photoURL, {
        dailyResetTime: resetTime,
        timezone: defaultTz,
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

  return (
    <div className="onboarding">
      <div className="onboarding__container">
        <h1 className="t-display">[ WELCOME ]</h1>
        <p className="t-body" style={{ color: "var(--text-secondary)", marginBottom: 32 }}>
          Let's configure your core preferences.
        </p>

        <form className="onboarding__form" onSubmit={handleFinish}>
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

          <div style={{ marginTop: "32px" }}>
            <button 
               type="submit" 
               className="onboarding__submit t-label"
               disabled={isSubmitting}
            >
              {isSubmitting ? "[ SAVING... ]" : "[ INITIALIZE ]"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

