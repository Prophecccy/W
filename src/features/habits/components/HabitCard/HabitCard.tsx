import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Habit } from "../../types";
import { LucideIcon } from "../../../../shared/components/IconPicker/LucideIcon";
import { addDays, getToday } from "../../../../shared/utils/dateUtils";
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
  doneToday?: boolean;
  onComplete: () => void;
  onUndo: () => void;
  onClick: () => void;
  currentValue?: number; // For metric/limiter types
  riskScore?: number;    // 0–100 from Predictive Strike Risk Engine
  isResting?: boolean;
  userResetTime?: string;
  upcomingStatus?: string;
}

function getCooldownText(habit: Habit, userResetTime?: string): string {
  if (!habit.lastCompletedDate) return "";
  const nextActiveStr = addDays(habit.lastCompletedDate, habit.intervalDays);
  const todayStr = getToday(undefined, userResetTime);
  
  const nextActive = new Date(nextActiveStr + "T00:00:00");
  const today = new Date(todayStr + "T00:00:00");
  const diffMs = nextActive.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) {
    return "RETURNS TODAY";
  }
  if (diffDays === 1) {
    return "RETURNS TOMORROW";
  }
  if (diffDays === 2) {
    return "RETURNS IN 2 DAYS";
  }
  if (diffDays < 7) {
    const weekdays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    const dayName = weekdays[nextActive.getDay()];
    return `RETURNS ON ${dayName}`;
  }
  return `RETURNS IN ${diffDays} DAYS`;
}

export function HabitCard({
  habit,
  isCompletedToday,
  doneToday = false,
  onComplete,
  onUndo,
  onClick,
  currentValue = 0,
  riskScore,
  isResting = false,
  userResetTime,
  upcomingStatus,
}: HabitCardProps) {
  const { showToast } = useToast();
  const [isHolding, setIsHolding] = useState(false);
  const [completeTriggered, setCompleteTriggered] = useState(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const hasHeldRef = useRef(false);
  const pointerStartCoordsRef = useRef<{ x: number; y: number } | null>(null);

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
  const startHold = (e: React.PointerEvent<HTMLDivElement>) => {
    // Keep track of the initial touch coordinate to prevent scroll/drag completion collisions
    pointerStartCoordsRef.current = { x: e.clientX, y: e.clientY };
    hasHeldRef.current = false;

    // Cancel any existing running hold first to ensure double-tap safety
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    if (isResting || upcomingStatus || isCompletedToday) return;
    
    setIsHolding(true);
    setCompleteTriggered(false);
    
    holdTimeoutRef.current = window.setTimeout(() => {
      setCompleteTriggered(true);
      setIsHolding(false);
      hasHeldRef.current = true;
      playCompletionSound();
      onComplete();

      const isLimiter = habit.type === "limiter";
      const isExceeded = isLimiter && (currentValue + 1) > target;
      const toastMessage = isLimiter
        ? isExceeded
          ? `[ LIMIT EXCEEDED ] Strike added!`
          : `Logged ${habit.title}`
        : `Completed ${habit.title}`;

      showToast(toastMessage, {
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
    pointerStartCoordsRef.current = null;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isHolding || !pointerStartCoordsRef.current) return;
    
    const deltaX = Math.abs(e.clientX - pointerStartCoordsRef.current.x);
    const deltaY = Math.abs(e.clientY - pointerStartCoordsRef.current.y);
    
    // If the pointer has drifted by more than 5px, cancel the hold immediately!
    if (deltaX > 5 || deltaY > 5) {
      cancelHold();
    }
  };

  useEffect(() => {
    return cancelHold; // Cleanup timeout on unmount
  }, []);

  // ─── Metric Logic ───────────────────────────────────────────────
  const target = habit.metric?.targetValue || 1;
  const progressPercent = Math.min(100, (currentValue / target) * 100);

  const handlePointerUp = () => {
    const shouldClick = !hasHeldRef.current && pointerStartCoordsRef.current !== null;
    cancelHold();
    if (shouldClick) {
      onClick();
    }
  };

  return (
    <div
      className={`habit-card ${isCompletedToday ? "habit-card--completed" : ""} ${isResting ? "habit-card--resting" : ""} ${isHolding ? "habit-card--holding" : ""} level-tier-${Math.min(habit.level, 10)}${riskScore != null && riskScore > 90 ? " risk-critical" : riskScore != null && riskScore > 75 ? " risk-elevated" : ""}`}
      style={cardStyle}
      onPointerDown={startHold}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
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
            <div className="habit-card__title-stack">
              <span 
                className="habit-card__title t-body"
                style={{
                  textDecoration: isCompletedToday ? "line-through" : "none",
                  color: isCompletedToday ? "var(--text-muted)" : "var(--text-primary)"
                }}
              >
                {habit.title}
              </span>
              {doneToday && !isCompletedToday && (
                <span className="habit-card__done-today t-meta">
                  ✓ DONE TODAY
                </span>
              )}
            </div>
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

          {upcomingStatus ? (
            <div className="habit-card__cooldown t-meta" style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
              [ {upcomingStatus.toUpperCase()} ]
            </div>
          ) : isResting ? (
            <div className="habit-card__cooldown t-meta" style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
              [ {getCooldownText(habit, userResetTime)} ]
            </div>
          ) : (
            <>
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
            </>
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
