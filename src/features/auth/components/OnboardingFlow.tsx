import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthContext } from "../context";
import { createUserDoc } from "../services/userService";
import { useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useToast } from "../../../shared/components/Toast/Toast";
import { TimeInput } from "../../../shared/components/RadialTimePicker/TimeInput";
import { SPRING_TACTILE, SPRING_POP } from "../../../shared/constants/motion";
import {
  playMechanicalClick,
  playSubtleThud,
  playLockLatch,
  playMilestoneChirp,
  playCompletionSound,
} from "../../../shared/services/tactileAudioService";
import "./OnboardingFlow.css";

interface OnboardingFlowProps {
  onComplete?: () => Promise<void>;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { user, signingIn, signIn, signOut, devSkip } = useAuthContext();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
  const appWindow = isTauri ? getCurrentWindow() : null;

  // Onboarding step (1 to 3)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Kinetic Fuel State
  const [demoFuel, setDemoFuel] = useState(75);

  // Step 2: Interactive Strike State
  const [demoStrikes, setDemoStrikes] = useState(2);

  // Step 3: Calibration Parameters
  const [wakeTime, setWakeTime] = useState("07:00");
  const [sleepTime, setSleepTime] = useState("23:00");
  const [resetTime, setResetTime] = useState("04:00");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDrag = (e: React.PointerEvent) => {
    if (
      e.target instanceof Element &&
      (e.target.closest("button") || e.target.closest("input") || e.target.closest("a"))
    )
      return;
    try {
      getCurrentWindow().startDragging();
    } catch {
      // Ignore if not in desktop Tauri
    }
  };

  const handleStrikeTap = (index: number) => {
    const nextStrikes = index + 1 === demoStrikes ? index : index + 1;
    setDemoStrikes(nextStrikes);

    if (nextStrikes >= 5) {
      playLockLatch();
    } else {
      playSubtleThud();
      playMilestoneChirp();
    }
  };

  const handleCompleteSetup = async () => {
    if (!user) return;
    setIsSubmitting(true);
    playCompletionSound();
    try {
      const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const newDoc = await createUserDoc(user.uid, user.email, user.displayName, user.photoURL, {
        dailyResetTime: resetTime,
        timezone: defaultTz,
        wakeUpTime: wakeTime,
        bedTime: sleepTime,
      });

      console.log("[OnboardingFlow] User initialized:", newDoc.uid);
      await new Promise((resolve) => setTimeout(resolve, 350));

      if (onComplete) {
        await onComplete();
      }

      navigate("/");
      showToast("[ SYSTEM INITIALIZED ] - Operational parameters active.");
    } catch (err) {
      console.error("[OnboardingFlow] Setup failed:", err);
      showToast("Error establishing preferences. Please retry.");
      setIsSubmitting(false);
    }
  };

  // Auto-detect existing profile: If an existing user landed on OnboardingFlow before their cloud sync finished,
  // automatically release them directly to the command center once the doc is found.
  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    import("../services/userService").then(async ({ getUserDoc }) => {
      try {
        const existing = await getUserDoc(user.uid);
        if (existing && isMounted) {
          if (onComplete) {
            await onComplete();
          }
          navigate("/");
        }
      } catch {
        // No existing doc; keep showing onboarding
      }
    });
    return () => {
      isMounted = false;
    };
  }, [user, navigate, onComplete]);

  const handleExitOrClose = async () => {
    playMechanicalClick();
    if (appWindow) {
      try {
        await appWindow.close();
        return;
      } catch {
        // Fallback to web routing
      }
    }
    // Web environment: check if user already has an existing user profile (e.g. restored from cloud)
    if (user) {
      try {
        const { getUserDoc } = await import("../services/userService");
        const existingDoc = await getUserDoc(user.uid);
        if (existingDoc) {
          if (onComplete) {
            await onComplete();
          }
          navigate("/");
          return;
        }
      } catch (err) {
        console.warn("[OnboardingFlow] Check user doc error:", err);
      }
    }
    // No profile exists, sign out to login screen
    try {
      await signOut();
      navigate("/login");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="onboarding-flow" onPointerDown={handleDrag}>
      {/* Window Close Control */}
      <div className="onboarding-flow__controls">
        <button
          type="button"
          className="onboarding-flow__close-btn t-label"
          onClick={handleExitOrClose}
          aria-label="Close"
        >
          [ X ]
        </button>
      </div>

      <div className="onboarding-flow__container">
        {/* Progress Stepper Pills */}
        <div className="onboarding-flow__stepper">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`onboarding-flow__stepper-pill ${s <= step ? "stepper-pill--active" : ""}`}
            />
          ))}
        </div>

        {/* Dynamic Header */}
        <header className="onboarding-flow__header">
          <span className="onboarding-flow__step-indicator t-label">STAGE {step} OF 3</span>
          <h1 className="onboarding-flow__title t-display">
            {step === 1 && "[ WAKING FUEL ]"}
            {step === 2 && "[ HARD ACCOUNTABILITY ]"}
            {step === 3 && "[ CALIBRATE & LAUNCH ]"}
          </h1>
          <p className="onboarding-flow__subtitle t-meta">
            {step === 1 && "YOUR WAKING HOURS ARE A FINITE FUEL TANK. WATCH IT DRAIN IN REAL-TIME."}
            {step === 2 && "INCOMPLETE DAILY HABITS ACCRUE STRIKES. 5 STRIKES = SYSTEM LOCKDOWN."}
            {step === 3 && "ESTABLISH YOUR WAKE AND SLEEP OPERATING BOUNDARIES."}
          </p>
        </header>

        {/* Dynamic Kinetic Stage Views */}
        <div className="onboarding-flow__content">
          <AnimatePresence mode="wait">
            {/* ─── STAGE 1: WAKING FUEL GAUGE DEMO ─── */}
            {step === 1 && (
              <motion.div
                key="step-1"
                className="onboarding-stage"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={SPRING_TACTILE}
              >
                <div className="onboarding-fuel-display">
                  <div className="onboarding-fuel-meta">
                    <span className="t-label">[ DEPLETION GAUGE ]</span>
                    <span
                      className={`onboarding-fuel-percent t-data ${
                        demoFuel <= 20 ? "fuel--critical" : ""
                      }`}
                    >
                      {demoFuel}% {demoFuel <= 20 ? "CRITICAL" : "OPERATIONAL"}
                    </span>
                  </div>

                  <div className="onboarding-fuel-track">
                    <motion.div
                      className={`onboarding-fuel-fill ${demoFuel <= 20 ? "fill--critical" : ""}`}
                      animate={{ width: `${demoFuel}%` }}
                      transition={SPRING_TACTILE}
                    />
                  </div>
                </div>

                <div className="onboarding-fuel-controls">
                  <span className="t-meta" style={{ textAlign: "center", display: "block" }}>
                    SIMULATE DAILY BURN RATE:
                  </span>
                  <div className="onboarding-pill-row">
                    <button
                      type="button"
                      className={`onboarding-pill-btn ${demoFuel === 100 ? "pill--selected" : ""}`}
                      onClick={() => {
                        playMechanicalClick();
                        setDemoFuel(100);
                      }}
                    >
                      [ 100% WAKE ]
                    </button>
                    <button
                      type="button"
                      className={`onboarding-pill-btn ${demoFuel === 50 ? "pill--selected" : ""}`}
                      onClick={() => {
                        playMechanicalClick();
                        setDemoFuel(50);
                      }}
                    >
                      [ 50% MIDDAY ]
                    </button>
                    <button
                      type="button"
                      className={`onboarding-pill-btn ${demoFuel === 15 ? "pill--selected" : ""}`}
                      onClick={() => {
                        playSubtleThud();
                        setDemoFuel(15);
                      }}
                    >
                      [ 15% NIGHT ]
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─── STAGE 2: STRIKE DRILL DEMO ─── */}
            {step === 2 && (
              <motion.div
                key="step-2"
                className="onboarding-stage"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={SPRING_TACTILE}
              >
                <div
                  className={`onboarding-strike-box ${demoStrikes >= 5 ? "strike-box--breach" : ""}`}
                >
                  <div className="onboarding-strike-meta">
                    <span className="t-label">[ PENALTY TELEMETRY ]</span>
                    <span
                      className={`onboarding-strike-count t-data ${
                        demoStrikes >= 4 ? "count--alert" : ""
                      }`}
                    >
                      {demoStrikes} / 5 STRIKES
                    </span>
                  </div>

                  <div className="onboarding-strikes-grid">
                    {[0, 1, 2, 3, 4].map((i) => {
                      const isArmed = i < demoStrikes;
                      return (
                        <motion.button
                          key={i}
                          type="button"
                          className={`onboarding-strike-cell ${isArmed ? "strike-cell--armed" : ""}`}
                          whileTap={{ scale: 0.92 }}
                          transition={SPRING_POP}
                          onClick={() => handleStrikeTap(i)}
                          aria-label={`Strike ${i + 1}`}
                        >
                          ✕
                        </motion.button>
                      );
                    })}
                  </div>

                  <p className="onboarding-strike-status t-meta">
                    {demoStrikes >= 5
                      ? "⚠ FULL LOCKDOWN TRIGGERED: PENANCE MODAL ENFORCED."
                      : "TAP STRIKE CELLS TO TEST THE BREACH WARNING SYSTEM."}
                  </p>
                </div>
              </motion.div>
            )}

            {/* ─── STAGE 3: CALIBRATION & LAUNCH ─── */}
            {step === 3 && (
              <motion.div
                key="step-3"
                className="onboarding-stage"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={SPRING_TACTILE}
              >
                <div className="onboarding-time-grid">
                  <div className="onboarding-time-card">
                    <label className="t-label">[ WAKE TIME ]</label>
                    <span className="t-meta">START FUEL DRAIN</span>
                    <TimeInput value={wakeTime} onChange={(v) => setWakeTime(v)} />
                  </div>

                  <div className="onboarding-time-card">
                    <label className="t-label">[ BED TIME ]</label>
                    <span className="t-meta">EMPTY FUEL CEILING</span>
                    <TimeInput value={sleepTime} onChange={(v) => setSleepTime(v)} />
                  </div>
                </div>

                <div className="onboarding-reset-row">
                  <label className="t-label">[ DAILY RESET TIME ]</label>
                  <span className="t-meta">DEFAULT: 04:00 AM ROLLOVER</span>
                  <TimeInput value={resetTime} onChange={(v) => setResetTime(v)} />
                </div>

                {/* Authentication / Authorization Gate */}
                {!user && (
                  <div className="onboarding-auth-gate">
                    <button
                      type="button"
                      className="onboarding-google-btn t-label"
                      onClick={signIn}
                      disabled={signingIn}
                    >
                      {signingIn ? "[ CONNECTING GOOGLE AUTH... ]" : "[ SIGN IN WITH GOOGLE ]"}
                    </button>
                    {import.meta.env.DEV && (
                      <button
                        type="button"
                        className="onboarding-dev-btn t-label"
                        onClick={devSkip}
                        disabled={signingIn}
                      >
                        [ DEV SKIP LOGIN ]
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* High-Contrast Tactical Navigation Footer */}
        <footer className="onboarding-flow__footer">
          {step > 1 ? (
            <button
              type="button"
              className="onboarding-nav-btn onboarding-nav-btn--back t-label"
              onClick={() => {
                playMechanicalClick();
                setStep((prev) => (prev - 1) as 1 | 2);
              }}
              disabled={isSubmitting}
            >
              [ BACK ]
            </button>
          ) : (
            <button
              type="button"
              className="onboarding-nav-btn onboarding-nav-btn--back t-label"
              onClick={handleExitOrClose}
            >
              [ EXIT ]
            </button>
          )}

          {step < 3 ? (
            <motion.button
              type="button"
              className="onboarding-nav-btn onboarding-nav-btn--primary t-label"
              whileTap={{ scale: 0.96 }}
              transition={SPRING_TACTILE}
              onClick={() => {
                playMechanicalClick();
                setStep((prev) => (prev + 1) as 2 | 3);
              }}
            >
              {step === 1 ? "[ NEXT: STRIKES → ]" : "[ NEXT: CALIBRATE → ]"}
            </motion.button>
          ) : (
            <motion.button
              type="button"
              className="onboarding-nav-btn onboarding-nav-btn--launch t-label"
              whileTap={{ scale: 0.96 }}
              transition={SPRING_TACTILE}
              onClick={handleCompleteSetup}
              disabled={!user || isSubmitting}
            >
              {isSubmitting ? "[ INITIALIZING SYSTEM... ]" : "[ LAUNCH COMMAND CENTER ]"}
            </motion.button>
          )}
        </footer>
      </div>
    </div>
  );
}
