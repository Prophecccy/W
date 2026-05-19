import { Habit, HabitLog } from '../../../habits/types';
import { WidgetHabitCard } from './WidgetHabitCard';

interface WidgetHabitListProps {
  today: string;
  scheduledHabits: Habit[];
  todayLog: HabitLog | null;
  periodLogs: HabitLog[];
  weeklyResetDay: number;
  onComplete: (habitId: string) => void;
  onUndo: (habitId: string) => void;
}

export function WidgetHabitList({ today, scheduledHabits, todayLog, periodLogs, weeklyResetDay, onComplete, onUndo }: WidgetHabitListProps) {
  // Separate regular habits from limiters
  const regularHabits = scheduledHabits.filter(h => h.type !== 'limiter');
  const limiterHabits = scheduledHabits.filter(h => h.type === 'limiter');

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

  const sortedRegular = sortByCompletion(regularHabits);
  const sortedLimiters = sortByCompletion(limiterHabits);

  return (
    <div className="widget-habit-list">
      {/* Regular Habits */}
      {sortedRegular.map(habit => {
        const status = getStatus(habit);
        return (
          <WidgetHabitCard
            key={habit.id}
            habit={habit}
            isCompletedToday={status.isCompletedToday}
            doneToday={status.doneToday}
            onComplete={onComplete}
            onUndo={onUndo}
          />
        );
      })}

      {/* Limiter Section */}
      {sortedLimiters.length > 0 && (
        <>
          <div className="widget-habit-list__section-header t-label">
            [ LIMITERS ]
          </div>
          {sortedLimiters.map(habit => {
            const status = getStatus(habit);
            return (
              <WidgetHabitCard
                key={habit.id}
                habit={habit}
                isCompletedToday={status.isCompletedToday}
                doneToday={status.doneToday}
                onComplete={onComplete}
                onUndo={onUndo}
              />
            );
          })}
        </>
      )}

      {scheduledHabits.length === 0 && (
        <div className="widget-habit-list__empty t-meta">
          NO HABITS SCHEDULED TODAY
        </div>
      )}
    </div>
  );
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStart(dateStr: string, weekStartDay: number): string {
  const d = new Date(dateStr + "T12:00:00");
  while (d.getDay() !== weekStartDay) {
    d.setDate(d.getDate() - 1);
  }
  return formatDate(d);
}

function getMonthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

function getIntervalStart(habit: Habit, todayStr: string): string {
  if (habit.period !== "interval" || habit.intervalDays <= 0) return todayStr;
  const created = new Date(habit.createdAt);
  const today = new Date(todayStr + "T12:00:00");
  const diffDays = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return formatDate(created);
  const segmentStart = diffDays - (diffDays % habit.intervalDays);
  created.setDate(created.getDate() + segmentStart);
  return formatDate(created);
}

function getPeriodStart(habit: Habit, todayStr: string, weekStartDay: number): string {
  if (habit.period === "weekly") return getWeekStart(todayStr, weekStartDay);
  if (habit.period === "monthly") return getMonthStart(todayStr);
  if (habit.period === "interval") return getIntervalStart(habit, todayStr);
  return todayStr;
}

function isMultiDayMetric(habit: Habit): boolean {
  return habit.type === "metric" && (habit.period === "weekly" || habit.period === "monthly" || habit.period === "interval");
}
