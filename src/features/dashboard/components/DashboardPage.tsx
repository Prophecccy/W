import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { HabitCard } from '../../habits/components/HabitCard/HabitCard';
import { TodoCard } from '../../todos/components/TodoCard/TodoCard';
import { DailyNote } from '../../habits/components/DailyNote/DailyNote';
import { Habit, HabitLog } from '../../habits/types';
import { Todo } from '../../todos/types';
import { getHabits } from '../../habits/services/habitService';
import { getTodayLog, getLogRange, completeHabit, uncompleteHabit } from '../../habits/services/logService';
import { getLocalNote } from '../../logs/services/localLogService';
import { getTodos, completeTodo, completeNumberedTodoFull, incrementNumberedTodo } from '../../todos/services/todoService';
import { isHabitScheduledToday, isHabitResting } from '../../habits/utils/scheduleEngine';
import { getToday } from '../../../shared/utils/dateUtils';
import { User } from '../../../shared/types';
import { SleepTube } from './SleepTube';
import { isTauri } from '../../../shared/utils/tauri';
import './DashboardPage.css';

interface DashboardOutlet {
  userDoc: User;
  gapResult: any;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { userDoc } = useOutletContext<DashboardOutlet>();
  const [loading, setLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [log, setLog] = useState<HabitLog | null>(null);
  const [periodLogs, setPeriodLogs] = useState<HabitLog[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const today = useMemo(() => {
    return getToday(undefined, userDoc?.settings?.dailyResetTime);
  }, [userDoc?.settings?.dailyResetTime]);

  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    let unsubPromise: Promise<(() => void)[]> | null = null;

    async function setupListeners() {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        if (!active) return [];
        
        const unHabit = await listen('widget-habit-updated', (event) => {
          console.log('Dashboard: Received widget-habit-updated event', event);
          setRefreshTrigger(prev => prev + 1);
        });
        const unTodo = await listen('widget-todo-updated', (event) => {
          console.log('Dashboard: Received widget-todo-updated event', event);
          setRefreshTrigger(prev => prev + 1);
        });

        return [unHabit, unTodo];
      } catch (e) {
        console.error('Failed to setup listeners', e);
        return [];
      }
    }

    unsubPromise = setupListeners();

    return () => {
      active = false;
      if (unsubPromise) {
        unsubPromise.then((unsubs) => unsubs.forEach((unsub) => unsub())).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [fetchedHabits, fetchedLog, fetchedTodos, localNote] = await Promise.all([
          getHabits(),
          getTodayLog(userDoc?.settings?.dailyResetTime),
          getTodos(),
          getLocalNote(today)
        ]);
        fetchedLog.notes = localNote;
        
        const activeHabits = fetchedHabits.filter(h => !h.startDate || h.startDate <= today);
        setHabits(activeHabits);
        setLog(fetchedLog);
        setTodos(fetchedTodos);

        const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
        const scheduled = activeHabits.filter(h => isHabitScheduledToday(h, today, weeklyResetDay));
        let minStart = today;
        for (const h of scheduled) {
          if (!isMultiDayMetric(h)) continue;
          const start = getPeriodStart(h, today, weeklyResetDay);
          if (start < minStart) minStart = start;
        }

        if (scheduled.some(isMultiDayMetric)) {
          const logs = await getLogRange(minStart, today);
          setPeriodLogs(logs);
        } else {
          setPeriodLogs([]);
        }
      } catch (e) {
        console.error("Unified Dashboard Load Error", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [today, userDoc?.settings?.weeklyResetDay, refreshTrigger]);

  useEffect(() => {
    const handleSaved = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.date === today) {
        setLog(prev => prev ? { ...prev, notes: customEvent.detail.notes } : prev);
      }
    };
    window.addEventListener("w:note-saved", handleSaved);
    return () => window.removeEventListener("w:note-saved", handleSaved);
  }, [today]);

  // Derived state for Habits
  const scheduledHabits = useMemo(() => {
    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
    const filtered = habits.filter(h => {
      if (isHabitResting(h, userDoc?.settings?.dailyResetTime)) return false;

      if (isMultiDayMetric(h) && h.metric) {
        const target = h.metric.targetValue;
        const start = getPeriodStart(h, today, weeklyResetDay);
        const total = getTotalInRange(periodLogs, h.id, start);
        if (target > 0 && total >= target) return false;
      }

      const isComplete = !!log?.habits?.[h.id]?.completed;
      if (isComplete) return false;
      return isHabitScheduledToday(h, today, weeklyResetDay) && h.type !== 'limiter';
    });

    return filtered.sort((a, b) => {
      const aEntry = log?.habits?.[a.id];
      const bEntry = log?.habits?.[b.id];
      const aDoneToday = isMultiDayMetric(a) && (aEntry?.completions?.length ?? 0) > 0;
      const bDoneToday = isMultiDayMetric(b) && (bEntry?.completions?.length ?? 0) > 0;
      return Number(aDoneToday) - Number(bDoneToday);
    });
  }, [habits, log, today, periodLogs, userDoc?.settings?.weeklyResetDay]);

  // Derived state for Limiters
  const scheduledLimiters = useMemo(() => {
    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
    return habits.filter(h => {
      if (h.type !== 'limiter') return false;
      if (isHabitResting(h, userDoc?.settings?.dailyResetTime)) return false;
      return isHabitScheduledToday(h, today, weeklyResetDay);
    }).sort((a, b) => {
      const aEntry = log?.habits?.[a.id];
      const bEntry = log?.habits?.[b.id];
      const aDoneToday = (aEntry?.completions?.length ?? 0) > 0 || (aEntry?.value ?? 0) > 0;
      const bDoneToday = (bEntry?.completions?.length ?? 0) > 0 || (bEntry?.value ?? 0) > 0;
      return Number(aDoneToday) - Number(bDoneToday);
    });
  }, [habits, log, today, userDoc?.settings?.weeklyResetDay]);

  // Derived state for Todos (Current Active Todos)
  const currentTodos = useMemo(() => {
    return todos.filter(t => !t.future || t.future <= today);
  }, [todos, today]);

  // Actions for Habits
  const handleHabitComplete = async (habitId: string) => {
    const originalLog = log ? JSON.parse(JSON.stringify(log)) : null;
    try {
      const habit = habits.find(h => h.id === habitId);
      const target = habit?.metric?.targetValue ?? 1;
      setLog(prev => {
        if (!prev) return prev;
        const existing = prev.habits?.[habitId];
        const existingValue = existing?.value ?? 0;
        const newValue = existingValue + 1;
        const isCompleted =
          habit?.type === "metric"
            ? newValue >= target
            : habit?.type === "limiter"
              ? false
              : true;
        return {
          ...prev,
          habits: {
            ...prev.habits,
            [habitId]: {
              completed: isCompleted,
              value: newValue,
              target,
              completions: [...(existing?.completions ?? []), { timestamp: Date.now(), value: 1 }]
            }
          }
        };
      });
      await completeHabit(habitId, 1, target, "", userDoc?.settings?.dailyResetTime);
      // Notify other windows (HabitsPage, widget) about the change
      if (isTauri()) {
        import('@tauri-apps/api/event').then(({ emit }) => {
          emit('widget-habit-updated', { habitId, action: 'complete', source: 'dashboard' }).catch(() => {});
        });
      }
    } catch (e) {
      console.error(e);
      if (originalLog) {
        setLog(originalLog);
      }
      window.dispatchEvent(new CustomEvent("w:toast", { detail: "[ LOG COMPILATION FAILED ]" }));
    }
  };

  const handleHabitUndo = async (habitId: string) => {
    const originalLog = log ? JSON.parse(JSON.stringify(log)) : null;
    try {
      setLog(prev => {
        if (!prev) return prev;
        const newHabits = { ...prev.habits };
        const existing = newHabits[habitId];
        if (!existing || !existing.completions?.length) {
          delete newHabits[habitId];
          return { ...prev, habits: newHabits };
        }

        const newCompletions = existing.completions.slice(0, -1);
        const lastValue = existing.completions[existing.completions.length - 1].value;
        const newValue = Math.max(0, (existing.value ?? 0) - lastValue);
        
        const habit = habits.find(h => h.id === habitId);
        const isCompleted = habit?.type === "metric"
          ? newValue >= (existing.target ?? 1)
          : habit?.type === "limiter"
            ? false
            : true;

        if (newCompletions.length === 0) {
          delete newHabits[habitId];
        } else {
          newHabits[habitId] = { ...existing, completions: newCompletions, value: newValue, completed: isCompleted };
        }
        return { ...prev, habits: newHabits };
      });
      await uncompleteHabit(habitId, userDoc?.settings?.dailyResetTime);
      // Notify other windows (HabitsPage, widget) about the change
      if (isTauri()) {
        import('@tauri-apps/api/event').then(({ emit }) => {
          emit('widget-habit-updated', { habitId, action: 'undo', source: 'dashboard' }).catch(() => {});
        });
      }
    } catch (e) {
      console.error(e);
      if (originalLog) {
        setLog(originalLog);
      }
      window.dispatchEvent(new CustomEvent("w:toast", { detail: "[ LOG COMPILATION FAILED ]" }));
    }
  };

  // Actions for Todos
  const handleTodoComplete = async (todoId: string, updatedTodo?: Todo) => {
    try {
      const completedTodo = updatedTodo || todos.find(t => t.id === todoId);
      if (completedTodo) {
        setTodos(prev => prev.filter(t => t.id !== todoId));
        if (completedTodo.type === "numbered") {
           await completeNumberedTodoFull(todoId, completedTodo);
        } else {
           await completeTodo(todoId);
        }
      }
    } catch (e) {
      console.error(e);
      setRefreshTrigger(prev => prev + 1); // trigger reload to revert optimistic UI
    }
  };

  const handleTodoClick = async (todoId: string) => {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;

    if (todo.type === "numbered" && todo.numbered) {
       try {
          const newCurrent = todo.numbered.current + 1;
          if (newCurrent >= todo.numbered.target) {
            const finishedTodo: Todo = {
              ...todo,
              numbered: { ...todo.numbered, current: newCurrent }
            };
            handleTodoComplete(todoId, finishedTodo);
          } else {
            setTodos(prev => prev.map(t => 
              t.id === todoId ? { ...t, numbered: { ...t.numbered!, current: newCurrent } } : t
            ));
            await incrementNumberedTodo(todoId, todo);
          }
       } catch (e) {
          console.error(e);
          setRefreshTrigger(prev => prev + 1); // trigger reload to revert optimistic UI
       }
    }
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <h1 className="t-display">[ LOADING ]</h1>
      </div>
    );
  }

  const isDefaultCycle = userDoc?.settings?.wakeUpTime === "07:00" && userDoc?.settings?.bedTime === "23:00";

  return (
    <div className="dashboard-page">
      <div className="dashboard-page__content">
        {isDefaultCycle && (
          <div className="calibration-banner" onClick={() => navigate('/settings')} style={{ cursor: 'pointer', background: 'var(--bg-elevated)', padding: '16px', borderRadius: '4px', border: '1px solid var(--accent)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="t-label" style={{ color: 'var(--accent)', marginBottom: '4px' }}>[ CALIBRATION REQUIRED ]</h3>
              <p className="t-meta">Your wake/sleep cycle is using default values. Click here to calibrate your Waking Fuel gauge in Settings.</p>
            </div>
            <span className="t-meta" style={{ color: 'var(--accent)' }}>CONFIGURE &rarr;</span>
          </div>
        )}
        <div className="dashboard-grid">
          
          {/* COLUMN 1: SLEEP TUBE */}
          <SleepTube />

          {/* COLUMN 2: HABITS */}
          <div className="dashboard-column">
            <div className="dashboard-column__header">
              <h2 className="t-label" title="[ TODAY'S HABITS ]">[ TODAY'S HABITS ]</h2>
              <button 
                className="t-meta" 
                style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", textShadow: "var(--text-shadow-glow)" }}
                onClick={() => {
                  navigate("/habits");
                  setTimeout(() => window.dispatchEvent(new CustomEvent("w:open-habit-form")), 50);
                }}
              >
                + ADD
              </button>
            </div>
            
            {scheduledHabits.length === 0 ? (
              <div className="dashboard-empty--tactical t-meta">
                [ ALL ASSIGNED HABITS COMPLETED ]
              </div>
            ) : (
              <div className="dashboard-list">
                {scheduledHabits.map(h => (
                  <HabitCard 
                    key={h.id} 
                    habit={h} 
                    isCompletedToday={false} 
                    doneToday={(() => {
                      const entry = log?.habits?.[h.id];
                      const interactedToday = (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;
                      if (h.type === 'limiter') {
                        return interactedToday;
                      }
                      if (!isMultiDayMetric(h) || !h.metric) return false;
                      const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
                      const start = getPeriodStart(h, today, weeklyResetDay);
                      const total = getTotalInRange(periodLogs, h.id, start);
                      const periodCompleted = h.metric.targetValue > 0 ? total >= h.metric.targetValue : false;
                      return interactedToday && !periodCompleted;
                    })()}
                    onComplete={() => handleHabitComplete(h.id)} 
                    onUndo={() => handleHabitUndo(h.id)}
                    onClick={() => {}}
                    currentValue={log?.habits?.[h.id]?.value || 0}
                  />
                ))}
              </div>
            )}
          </div>

          {/* COLUMN 2.5: LIMITERS */}
          <div className="dashboard-column">
            <div className="dashboard-column__header">
              <h2 className="t-label" title="[ LIMITERS ]" style={{ color: "var(--strike-red)" }}>[ LIMITERS ]</h2>
              <button 
                className="t-meta" 
                style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", textShadow: "var(--text-shadow-glow)" }}
                onClick={() => {
                  navigate("/habits");
                  setTimeout(() => window.dispatchEvent(new CustomEvent("w:open-habit-form")), 50);
                }}
              >
                + ADD
              </button>
            </div>

            {scheduledLimiters.length === 0 ? (
              <div className="dashboard-empty--tactical t-meta">
                [ NO ACTIVE LIMITERS ]
              </div>
            ) : (
              <div className="dashboard-list">
                {scheduledLimiters.map(h => (
                  <HabitCard 
                    key={h.id} 
                    habit={h} 
                    isCompletedToday={false} 
                    doneToday={(() => {
                      const entry = log?.habits?.[h.id];
                      return (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;
                    })()}
                    onComplete={() => handleHabitComplete(h.id)} 
                    onUndo={() => handleHabitUndo(h.id)}
                    onClick={() => {}}
                    currentValue={log?.habits?.[h.id]?.value || 0}
                  />
                ))}
              </div>
            )}
          </div>

          {/* COLUMN 3: TODOS */}
          <div className="dashboard-column">
            <div className="dashboard-column__header">
              <h2 className="t-label" title="[ ACTIVE TODOS ]">[ ACTIVE TODOS ]</h2>
              <button 
                className="t-meta" 
                style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", textShadow: "var(--text-shadow-glow)" }}
                onClick={() => {
                  navigate("/todos");
                  setTimeout(() => window.dispatchEvent(new CustomEvent("w:open-todo-form")), 50);
                }}
              >
                + ADD
              </button>
            </div>

            {currentTodos.length === 0 ? (
              <div className="dashboard-empty--tactical t-meta">
                [ NO ACTIVE TODOS ]
              </div>
            ) : (
              <div className="dashboard-list">
                {currentTodos.map(todo => (
                  <TodoCard 
                    key={todo.id} 
                    todo={todo} 
                    onComplete={() => handleTodoComplete(todo.id)}
                    onClick={() => handleTodoClick(todo.id)}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      <div className="dashboard-page__footer">
        <DailyNote initialNote={log?.notes || ''} />
      </div>
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
  return (habit.type === "metric" || habit.type === "limiter") && (habit.period === "weekly" || habit.period === "monthly" || habit.period === "interval");
}

function getTotalInRange(logs: HabitLog[], habitId: string, startDate: string): number {
  let total = 0;
  for (const log of logs) {
    if (log.date < startDate) continue;
    total += log.habits?.[habitId]?.value ?? 0;
  }
  return total;
}
