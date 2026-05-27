import { useState, useRef, useCallback, PointerEvent, useEffect } from 'react';
import { Habit, CompletionEntry } from '../../../habits/types';
import { Check, Circle } from 'lucide-react';
import './WidgetHabitCard.css';

interface WidgetHabitCardProps {
  habit: Habit;
  isCompletedToday: boolean;
  doneToday?: boolean;
  currentValue?: number;
  completions?: CompletionEntry[];
  onComplete: (habitId: string) => void;
  onUndo: (habitId: string) => void;
}

export function WidgetHabitCard({
  habit,
  isCompletedToday,
  doneToday = false,
  currentValue = 0,
  completions = [],
  onComplete,
  onUndo,
}: WidgetHabitCardProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);
  const pointerStartCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const hasHeldRef = useRef(false);

  const HOLD_DURATION = 500;
  const UNDO_DURATION = 8000;

  // Synchronize undo state from database completions in real-time
  useEffect(() => {
    if (!completions || completions.length === 0) {
      setJustCompleted(false);
      return;
    }
    
    // Find the latest completion
    const latest = completions[completions.length - 1];
    const ageMs = Date.now() - latest.timestamp;
    
    if (ageMs < UNDO_DURATION) {
      setJustCompleted(true);
      
      // Auto-clear justCompleted after remaining time expires
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = window.setTimeout(() => {
        setJustCompleted(false);
      }, UNDO_DURATION - ageMs);
    } else {
      setJustCompleted(false);
    }
    
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, [completions]);

  const handleUndo = useCallback((e: PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    onUndo(habit.id);
    setJustCompleted(false);
  }, [habit.id, onUndo]);

  const startHold = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const isMetricLike = habit.type === 'metric' || habit.type === 'limiter';
    if (isMetricLike) {
      // Metric/limiter types are metric-like: we do not block clicks/holds even when completed
      // because we want to allow multiple rep logging.
    } else {
      if (isCompletedToday && !justCompleted) return;
    }

    if (justCompleted && !isMetricLike) {
      // Cancel undo and revert (for non-metric-like habits only on card level)
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      onUndo(habit.id);
      setJustCompleted(false);
      return;
    }

    pointerStartCoordsRef.current = { x: e.clientX, y: e.clientY };
    setIsHolding(true);
    hasHeldRef.current = false;

    holdTimeoutRef.current = window.setTimeout(() => {
      setIsHolding(false);
      setJustCompleted(true);
      hasHeldRef.current = true;
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
    pointerStartCoordsRef.current = null;
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isHolding || !pointerStartCoordsRef.current) return;
    const deltaX = Math.abs(e.clientX - pointerStartCoordsRef.current.x);
    const deltaY = Math.abs(e.clientY - pointerStartCoordsRef.current.y);
    if (deltaX > 5 || deltaY > 5) {
      cancelHold();
    }
  }, [isHolding, cancelHold]);

  const isCompleted = isCompletedToday || justCompleted;
  const isLimiter = habit.type === 'limiter';
  const isCommitted = isCompletedToday && !justCompleted;
  const isPendingUndo = justCompleted;
  const isDoneToday = doneToday && !isCompleted;

  return (
    <div
      className={`widget-habit-card ${isCommitted ? 'committed' : ''} ${isPendingUndo ? 'pending-undo' : ''} ${isDoneToday ? 'done-today' : ''} ${isLimiter ? 'limiter' : ''}`}
      style={{ '--card-accent': isLimiter ? 'var(--strike-red)' : habit.color } as React.CSSProperties}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerMove={handlePointerMove}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
    >
      {/* Hold fill animation */}
      {isHolding && <div className="widget-habit-card__hold-fill" />}

      <div className="widget-habit-card__icon">
        {isCompleted && !isLimiter ? (
          <Check size={18} strokeWidth={3.5} />
        ) : (
          <Circle size={18} strokeWidth={2.5} opacity={0.6} />
        )}
      </div>

      <div className="widget-habit-card__text">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <span className="widget-habit-card__title t-body" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {habit.title}
          </span>
          {(habit.type === 'metric' || habit.type === 'limiter') && habit.metric && (
            <span className="t-meta" style={{ flexShrink: 0, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {currentValue}/{habit.metric.targetValue}
            </span>
          )}
        </div>
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
            onPointerDown={handleUndo}
          >
            UNDO
          </span>
        )}
      </div>
    </div>
  );
}

