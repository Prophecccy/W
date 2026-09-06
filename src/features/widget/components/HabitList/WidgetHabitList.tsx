import { Habit, HabitLog } from '../../../habits/types';
import { WidgetHabitCard } from './WidgetHabitCard';
import { getPeriodStart, isMultiDayMetric } from '../../../../shared/utils/dateUtils';

interface WidgetHabitListProps {
  today: string;
  scheduledHabits: Habit[];
  scheduledLimiters: Habit[];
  todayLog: HabitLog | null;
  periodLogs: HabitLog[];
  weeklyResetDay: number;
  onComplete: (habitId: string, increment?: number) => void;
  onUndo: (habitId: string) => void;
  isFrozen?: boolean;
  isLocked?: boolean;
}

export function WidgetHabitList({ today, scheduledHabits, scheduledLimiters, todayLog, periodLogs, weeklyResetDay, onComplete, onUndo, isFrozen = false, isLocked = false }: WidgetHabitListProps) {
  const getTotalInRange = (habitId: string, startDate: string) => {
    let total = 0;
    for (const log of periodLogs) {
      if (log.date < startDate) continue;
      total += log.habits?.[habitId]?.value ?? 0;
    }
    return total;
  };

  const getTarget = (habit: Habit) => {
    return habit.metric?.targetValue ?? 0;
  };

  const getStatus = (habit: Habit) => {
    const entry = todayLog?.habits?.[habit.id];
    const interactedToday = (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;

    if (isMultiDayMetric(habit)) {
      const target = getTarget(habit);
      const start = getPeriodStart(habit, today, weeklyResetDay);
      const periodCompleted = target > 0 ? getTotalInRange(habit.id, start) >= target : false;
      const sortBucket = periodCompleted ? 2 : interactedToday ? 1 : 0;
      return { sortBucket, isCompletedToday: periodCompleted, doneToday: interactedToday && !periodCompleted };
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
          ? getTotalInRange(habit.id, start)
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
                ? getTotalInRange(habit.id, start)
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
                  disabled={isFrozen}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}
