import { useState, useCallback, useEffect } from 'react';
import { EyeOff, Eye } from 'lucide-react';
import { Habit, HabitLog } from '../../../habits/types';
import { WidgetHabitCard } from './WidgetHabitCard';
import { getPeriodStart, isMultiDayMetric, getTotalInRange } from '../../../../shared/utils/dateUtils';
import { playMechanicalClick } from '../../../../shared/services/tactileAudioService';

interface WidgetHabitListProps {
  today: string;
  scheduledHabits: Habit[];
  scheduledLimiters: Habit[];
  todayLog: HabitLog | null;
  periodLogs: HabitLog[];
  weeklyResetDay: number;
  onComplete: (habitId: string, increment?: number) => void;
  onUndo: (habitId: string) => void;
  onHideHabit?: (habitId: string) => void;
  onRestoreHidden?: () => void;
  hiddenCount?: number;
  isFrozen?: boolean;
  isLocked?: boolean;
}

export function WidgetHabitList({
  today,
  scheduledHabits,
  scheduledLimiters,
  todayLog,
  periodLogs,
  weeklyResetDay,
  onComplete,
  onUndo,
  onHideHabit,
  onRestoreHidden,
  hiddenCount = 0,
  isFrozen = false,
  isLocked = false,
}: WidgetHabitListProps) {
  const [contextMenu, setContextMenu] = useState<{
    habitId: string;
    title: string;
    x: number;
    y: number;
  } | null>(null);

  const handleCardContextMenu = useCallback((e: React.MouseEvent, habit: Habit) => {
    e.preventDefault();
    e.stopPropagation();

    // Clamp menu coordinates within the widget window
    const menuWidth = 170;
    const menuHeight = 44;
    const maxX = window.innerWidth - menuWidth - 8;
    const maxY = window.innerHeight - menuHeight - 8;
    const x = Math.min(Math.max(8, e.clientX), Math.max(8, maxX));
    const y = Math.min(Math.max(8, e.clientY), Math.max(8, maxY));

    setContextMenu({
      habitId: habit.id,
      title: habit.title,
      x,
      y,
    });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const getTarget = (habit: Habit) => {
    return habit.metric?.targetValue ?? 0;
  };

  const getStatus = (habit: Habit) => {
    const entry = todayLog?.habits?.[habit.id];
    const interactedToday = (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;

    if (isMultiDayMetric(habit)) {
      const target = getTarget(habit);
      const start = getPeriodStart(habit, today, weeklyResetDay);
      const periodCompleted = target > 0 ? getTotalInRange(periodLogs, habit.id, start) >= target : false;
      const isCompletedToday = periodCompleted && interactedToday;
      const sortBucket = isCompletedToday ? 2 : interactedToday ? 1 : 0;
      return { sortBucket, isCompletedToday, doneToday: interactedToday && !periodCompleted };
    }

    const completedToday = entry?.completed === true;
    return { sortBucket: completedToday ? 2 : 0, isCompletedToday: completedToday, doneToday: false };
  };

  // Sort: active first, done-today next, fully completed at bottom
  const sortByCompletion = (habits: Habit[]) => {
    return [...habits].sort((a, b) => {
      return getStatus(a).sortBucket - getStatus(b).sortBucket;
    });
  };

  const sortedHabits = sortByCompletion(scheduledHabits);

  return (
    <div className="widget-habit-list">
      {/* Scheduled Habits */}
      {sortedHabits.map(habit => {
        const status = getStatus(habit);
        const isMulti = habit.period === "weekly" || habit.period === "monthly" || habit.period === "interval";
        const start = getPeriodStart(habit, today, weeklyResetDay);
        const currentValue = isMulti
          ? getTotalInRange(periodLogs, habit.id, start)
          : (todayLog?.habits?.[habit.id]?.value || 0);
        const completions = todayLog?.habits?.[habit.id]?.completions || [];
        return (
          <WidgetHabitCard
            key={habit.id}
            habit={habit}
            isCompletedToday={status.isCompletedToday}
            doneToday={status.doneToday}
            currentValue={currentValue}
            completions={completions}
            onComplete={onComplete}
            onUndo={onUndo}
            onContextMenu={handleCardContextMenu}
            disabled={isFrozen || isLocked}
          />
        );
      })}

      {scheduledHabits.length === 0 && (
        <div className="widget-habit-list__empty t-meta">
          NO HABITS SCHEDULED TODAY
        </div>
      )}

      {/* Limiters Section */}
      {scheduledLimiters && scheduledLimiters.length > 0 && (
        <div className="widget-habit-list__limiters-section" style={{ marginTop: "16px" }}>
          <div className="widget-habit-list__section-title t-label" style={{ color: "var(--strike-red)", marginBottom: "8px", textShadow: "var(--text-shadow-sharp)" }}>
            [ LIMITERS ]
          </div>
          {[...scheduledLimiters]
            .sort((a, b) => {
              const entryA = todayLog?.habits?.[a.id];
              const entryB = todayLog?.habits?.[b.id];
              const intA = (entryA?.completions?.length ?? 0) > 0 || (entryA?.value ?? 0) > 0 ? 1 : 0;
              const intB = (entryB?.completions?.length ?? 0) > 0 || (entryB?.value ?? 0) > 0 ? 1 : 0;
              return intA - intB;
            })
            .map((habit: Habit) => {
              const entry = todayLog?.habits?.[habit.id];
              const interactedToday = (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;
              const isMulti = habit.period === "weekly" || habit.period === "monthly" || habit.period === "interval";
              const start = getPeriodStart(habit, today, weeklyResetDay);
              const currentValue = isMulti
                ? getTotalInRange(periodLogs, habit.id, start)
                : (todayLog?.habits?.[habit.id]?.value || 0);
              const completions = todayLog?.habits?.[habit.id]?.completions || [];
              
              return (
                <WidgetHabitCard
                  key={habit.id}
                  habit={habit}
                  isCompletedToday={false}
                  doneToday={interactedToday}
                  currentValue={currentValue}
                  completions={completions}
                  onComplete={onComplete}
                  onUndo={onUndo}
                  onContextMenu={handleCardContextMenu}
                  disabled={isFrozen}
                />
              );
            })}
        </div>
      )}

      {/* Restore Hidden Habits Bar */}
      {hiddenCount > 0 && onRestoreHidden && (
        <div className="widget-habit-list__restore-bar">
          <button
            type="button"
            className="widget-habit-list__restore-btn"
            onClick={() => {
              playMechanicalClick();
              onRestoreHidden();
            }}
          >
            <Eye size={12} strokeWidth={2.2} />
            <span>[ {hiddenCount} HIDDEN · RESTORE ]</span>
          </button>
        </div>
      )}

      {/* Context Menu Popup */}
      {contextMenu && (
        <div
          className="widget-habit-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="widget-habit-context-menu__item"
            onClick={() => {
              const id = contextMenu.habitId;
              setContextMenu(null);
              playMechanicalClick();
              onHideHabit?.(id);
            }}
          >
            <EyeOff size={13} strokeWidth={2.5} />
            <span>[ HIDE HABIT ]</span>
          </button>
        </div>
      )}
    </div>
  );
}
