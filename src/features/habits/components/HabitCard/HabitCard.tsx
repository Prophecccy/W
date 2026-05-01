import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Habit } from "../../types";
import { LucideIcon } from "../../../../shared/components/IconPicker/LucideIcon";
import { useToast } from "../../../../shared/components/Toast/Toast";
import { playCompletionSound } from "../../../../shared/services/completionSound";
import { FlameIcon } from "../../../../shared/components/FlameIcon/FlameIcon";
import { LevelBadge } from "../../../../shared/components/LevelBadge/LevelBadge";
import { ConfettiParticles } from "../../../../shared/components/ConfettiParticles/ConfettiParticles";
import "./HabitCard.css";
import "./HabitCardTiers.css";

interface HabitCardProps {
  habit: Habit;
  isCompletedToday: boolean;
  onComplete: () => void;
  onUndo: () => void;
  onClick: () => void;
  currentValue?: number; // For metric/limiter types
  riskScore?: number;    // 0–100 from Predictive Strike Risk Engine
}

export function HabitCard({
  habit,
  isCompletedToday,
  onComplete,
  onUndo,
  onClick,
  currentValue = 0,
  riskScore,
}: HabitCardProps) {
  const { showToast } = useToast();
  const [isHolding, setIsHolding] = useState(false);
  const [completeTriggered, setCompleteTriggered] = useState(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const hasHeldRef = useRef(false);

  const HOLD_DURATION = 500; // ms to hold to verify

  // ─── Level Visual Progression Logic ──────────────────────────────
  // Lv1 = normal, Lv2+ = subtle border glow & shimmer
  const cardStyle = {
    "--card-accent": habit.type === "limiter" ? "var(--strike-red)" : habit.color,
    boxShadow:
      habit.level >= 2 && !isCompletedToday
        ? `0 0 8px 1px ${habit.color}15` // Extremely subtle glow
        : "none",
  } as React.CSSProperties;

  // ─── Interaction Handlers ───────────────────────────────────────
  const startHold = () => {
    if (isCompletedToday || habit.type === "metric" || habit.type === "limiter") {
      // Metric/limiter standard hold logic might differ (maybe tap opens input dialog instead).
      // For checklist scope, let's treat standard types with hold-to-verify.
      // Limiters might auto-complete or increment on tap. Let's allow standard hold for now unless overridden.
      // We will allow holding for all boolean completions if target is 1. 
      // If it's a multi-metric, holding could just increment. 
      // The requirement doesn't specify metric hold-to-verify split from standard, so we'll enable it globally.
    }
    
    if (isCompletedToday) return; // Cannot hold to verify if already verified. Undo is separate.
    
    setIsHolding(true);
    setCompleteTriggered(false);
    hasHeldRef.current = false;
    
    holdTimeoutRef.current = window.setTimeout(() => {
      setCompleteTriggered(true);
      setIsHolding(false);
      hasHeldRef.current = true;
      playCompletionSound();
      onComplete();
      showToast(`Completed ${habit.title}`, {
        actionLabel: 'UNDO',
        onAction: () => onUndo()
      });
    }, HOLD_DURATION);
  };

  const cancelHold = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    setIsHolding(false);
  };

  useEffect(() => {
    return cancelHold; // Cleanup timeout on unmount
  }, []);

  // ─── Metric Logic ───────────────────────────────────────────────
  const target = habit.metric?.targetValue || 1;
  const progressPercent = Math.min(100, (currentValue / target) * 100);

  const handlePointerUp = () => {
    cancelHold();
    if (!hasHeldRef.current) {
      onClick();
    }
  };

  return (
    <div
      className={`habit-card ${isCompletedToday ? "habit-card--completed" : ""} ${isHolding ? "habit-card--holding" : ""} level-tier-${Math.min(habit.level, 10)}${riskScore != null && riskScore > 90 ? " risk-critical" : riskScore != null && riskScore > 75 ? " risk-elevated" : ""}`}
      style={cardStyle}
      onPointerDown={startHold}
      onPointerUp={handlePointerUp}
      onPointerLeave={cancelHold}
      onContextMenu={(e) => {
         // Prevent right click menu on touch hold
         e.preventDefault();
      }}
    >
      {/* Background Fill Animation (Hold to Verify) */}
      <AnimatePresence>
        {isHolding && !completeTriggered && (
          <motion.div
            className="habit-card__fill"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            exit={{ width: "0%", transition: { duration: 0.1 } }}
            transition={{ duration: HOLD_DURATION / 1000, ease: "linear" }}
          />
        )}
      </AnimatePresence>

      <div className="habit-card__content">
        <div className="habit-card__header">
          <div className="habit-card__title-group">
            <LucideIcon
              name={habit.icon}
              size={20}
              className="habit-card__icon"
              style={{ color: isCompletedToday ? "var(--text-muted)" : "var(--card-accent)" }}
            />
            <span 
              className="habit-card__title t-body"
              style={{
                textDecoration: isCompletedToday ? "line-through" : "none",
                color: isCompletedToday ? "var(--text-muted)" : "var(--text-primary)"
              }}
            >
              {habit.title}
            </span>
            {riskScore != null && riskScore > 75 && !isCompletedToday && (
              <span className={`habit-card__risk-tag t-meta ${riskScore > 90 ? 'risk-critical-tag' : 'risk-elevated-tag'}`}>
                [ RISK: {riskScore}% ]
              </span>
            )}
          </div>

          {(habit.currentStreak > 0 || habit.level > 0) && (
            <div className="habit-card__stats-group">
              {habit.currentStreak > 0 && (
                <FlameIcon streak={habit.currentStreak} />
              )}
              {habit.level > 0 && (
                <LevelBadge level={habit.level} className="habit-card__level" />
              )}
            </div>
          )}
        </div>

        <div className="habit-card__footer">
          <div className="habit-card__badges">
            <span className="badge t-meta">[ {habit.period.toUpperCase()} ]</span>
            {habit.type !== "standard" && (
              <span className={`badge t-meta ${habit.type === 'limiter' ? 'limiter-badge' : ''}`}>
                [ {habit.type.toUpperCase()} ]
              </span>
            )}
          </div>

          {/* Metric / Limiter Progress Display */}
          {(habit.type === "metric" || habit.type === "limiter") && habit.metric && (
            <div className="habit-card__metric-display t-meta">
              <span>{Math.floor(currentValue)}/{Math.floor(target)} {habit.metric.unit}</span>
            </div>
          )}
          
          {/* Checkmark and Confetti on finish */}
          {isCompletedToday && (
             <div className="habit-card__complete-check">
               <LucideIcon name="Check" size={16} />
               {completeTriggered && (
                 <ConfettiParticles particleCount={16} />
               )}
             </div>
          )}
        </div>
      </div>

      {/* Progress Bar Layer matching checklist 77 */}
      {habit.type !== "standard" && habit.metric && (
         <div className="habit-card__progress-track">
            <div 
               className="habit-card__progress-fill" 
               style={{ width: `${progressPercent}%` }}
               data-limit-exceeded={habit.type === 'limiter' && currentValue > target}
            />
         </div>
      )}
    </div>
  );
}
