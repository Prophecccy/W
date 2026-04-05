import { useState, useRef, useCallback } from 'react';
import { Habit } from '../../../habits/types';
import { LucideIcon } from '../../../../shared/components/IconPicker/LucideIcon';
import { Check } from 'lucide-react';
import './WidgetHabitCard.css';

interface WidgetHabitCardProps {
  habit: Habit;
  isCompletedToday: boolean;
  onComplete: (habitId: string) => void;
  onUndo: (habitId: string) => void;
}

export function WidgetHabitCard({ habit, isCompletedToday, onComplete, onUndo }: WidgetHabitCardProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);

  const HOLD_DURATION = 500;
  const UNDO_DURATION = 8000;

  const startHold = useCallback(() => {
    if (isCompletedToday && !justCompleted) return; // Already done from a prior session
    if (justCompleted) {
      // Cancel undo and revert
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      onUndo(habit.id);
      setJustCompleted(false);
      return;
    }

    setIsHolding(true);
    holdTimeoutRef.current = window.setTimeout(() => {
      setIsHolding(false);
      setJustCompleted(true);
      onComplete(habit.id);

      // Auto-clear undo window after 8s
      undoTimeoutRef.current = window.setTimeout(() => {
        setJustCompleted(false);
      }, UNDO_DURATION);
    }, HOLD_DURATION);
  }, [isCompletedToday, justCompleted, habit.id, onComplete, onUndo]);

  const cancelHold = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    setIsHolding(false);
  }, []);

  const isCompleted = isCompletedToday || justCompleted;
  const isLimiter = habit.type === 'limiter';

  return (
    <div
      className={`widget-habit-card ${isCompleted ? 'completed' : ''} ${isLimiter ? 'limiter' : ''}`}
      style={{ '--card-accent': isLimiter ? 'var(--strike-red)' : habit.color } as React.CSSProperties}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
    >
      {/* Hold fill animation */}
      {isHolding && <div className="widget-habit-card__hold-fill" />}

      <div className="widget-habit-card__icon">
        {isCompleted ? (
          <Check size={14} strokeWidth={2.5} />
        ) : (
          <LucideIcon name={habit.icon} size={14} />
        )}
      </div>

      <span className="widget-habit-card__title t-body">
        {habit.title}
      </span>

      <div className="widget-habit-card__streak t-meta">
        {habit.currentStreak > 0 && !isCompleted && (
          <span>🔥 {habit.currentStreak}</span>
        )}
        {justCompleted && (
          <span className="widget-habit-card__undo">UNDO</span>
        )}
      </div>
    </div>
  );
}
