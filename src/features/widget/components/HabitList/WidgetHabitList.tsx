import { Habit, HabitLog } from '../../../habits/types';
import { WidgetHabitCard } from './WidgetHabitCard';

interface WidgetHabitListProps {
  scheduledHabits: Habit[];
  todayLog: HabitLog | null;
  onComplete: (habitId: string) => void;
  onUndo: (habitId: string) => void;
}

export function WidgetHabitList({ scheduledHabits, todayLog, onComplete, onUndo }: WidgetHabitListProps) {
  // Separate regular habits from limiters
  const regularHabits = scheduledHabits.filter(h => h.type !== 'limiter');
  const limiterHabits = scheduledHabits.filter(h => h.type === 'limiter');

  // Sort: uncompleted first, completed at bottom
  const sortByCompletion = (habits: Habit[]) => {
    return [...habits].sort((a, b) => {
      const aCompleted = todayLog?.habits?.[a.id]?.completed ? 1 : 0;
      const bCompleted = todayLog?.habits?.[b.id]?.completed ? 1 : 0;
      return aCompleted - bCompleted;
    });
  };

  const sortedRegular = sortByCompletion(regularHabits);
  const sortedLimiters = sortByCompletion(limiterHabits);

  const isCompleted = (habitId: string) => {
    return todayLog?.habits?.[habitId]?.completed === true;
  };

  return (
    <div className="widget-habit-list">
      {/* Regular Habits */}
      {sortedRegular.map(habit => (
        <WidgetHabitCard
          key={habit.id}
          habit={habit}
          isCompletedToday={isCompleted(habit.id)}
          onComplete={onComplete}
          onUndo={onUndo}
        />
      ))}

      {/* Limiter Section */}
      {sortedLimiters.length > 0 && (
        <>
          <div className="widget-habit-list__section-header t-label">
            [ LIMITERS ]
          </div>
          {sortedLimiters.map(habit => (
            <WidgetHabitCard
              key={habit.id}
              habit={habit}
              isCompletedToday={isCompleted(habit.id)}
              onComplete={onComplete}
              onUndo={onUndo}
            />
          ))}
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
