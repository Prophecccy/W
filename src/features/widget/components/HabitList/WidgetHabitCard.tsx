import { useState, useRef, useCallback, MouseEvent, TouchEvent } from 'react';
import { Habit } from '../../../habits/types';
import { Check, Circle } from 'lucide-react';
import './WidgetHabitCard.css';

interface WidgetHabitCardProps {
  habit: Habit;
  isCompletedToday: boolean;
  doneToday?: boolean;
  onComplete: (habitId: string) => void;
  onUndo: (habitId: string) => void;
}

export function WidgetHabitCard({ habit, isCompletedToday, doneToday = false, onComplete, onUndo }: WidgetHabitCardProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);

  const HOLD_DURATION = 500;
  const UNDO_DURATION = 8000;

  const handleUndo = useCallback((e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    onUndo(habit.id);
    setJustCompleted(false);
  }, [habit.id, onUndo]);

  const startHold = useCallback(() => {
    const isMetric = habit.type === 'metric';
    if (isMetric) {
      if (isCompletedToday) return;
    } else {
      if (isCompletedToday && !justCompleted) return;
    }

    if (justCompleted && !isMetric) {
      // Cancel undo and revert (for non-metric habits only on card level)
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
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = window.setTimeout(() => {
        setJustCompleted(false);
      }, UNDO_DURATION);
    }, HOLD_DURATION);
  }, [isCompletedToday, justCompleted, habit.id, habit.type, onComplete, onUndo]);

  const cancelHold = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    setIsHolding(false);
  }, []);

  const isCompleted = isCompletedToday || justCompleted;
  const isLimiter = habit.type === 'limiter';
  const isCommitted = isCompletedToday && !justCompleted;
  const isPendingUndo = justCompleted;
  const isDoneToday = doneToday && !isCompleted;

  return (
    <div
      className={`widget-habit-card ${isCommitted ? 'committed' : ''} ${isPendingUndo ? 'pending-undo' : ''} ${isDoneToday ? 'done-today' : ''} ${isLimiter ? 'limiter' : ''}`}
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
          <Check size={18} strokeWidth={3.5} />
        ) : (
          <Circle size={18} strokeWidth={2.5} opacity={0.6} />
        )}
      </div>

      <div className="widget-habit-card__text">
        <span className="widget-habit-card__title t-body">
          {habit.title}
        </span>
        {isDoneToday && (
          <span className="widget-habit-card__done-today t-meta">
            ✓ DONE TODAY
          </span>
        )}
      </div>

      <div className="widget-habit-card__streak t-meta">
        {habit.currentStreak > 0 && !isCompleted && (
          <span>🔥 {habit.currentStreak}</span>
        )}
        {justCompleted && (
          <span
            className="widget-habit-card__undo"
            onMouseDown={handleUndo}
            onTouchStart={handleUndo}
          >
            UNDO
          </span>
        )}
      </div>
    </div>
  );
}

