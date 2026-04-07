import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { HabitCard } from '../../habits/components/HabitCard/HabitCard';
import { TodoCard } from '../../todos/components/TodoCard/TodoCard';
import { Habit, HabitLog } from '../../habits/types';
import { Todo } from '../../todos/types';
import { getHabits } from '../../habits/services/habitService';
import { getTodayLog, completeHabit, uncompleteHabit } from '../../habits/services/logService';
import { getTodos, completeTodo, completeNumberedTodoFull, incrementNumberedTodo } from '../../todos/services/todoService';
import { isHabitScheduledToday } from '../../habits/utils/scheduleEngine';
import { getToday } from '../../../shared/utils/dateUtils';
import './DashboardPage.css';

export function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [log, setLog] = useState<HabitLog | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  
  const today = getToday();

  useEffect(() => {
    async function loadData() {
      try {
        const [fetchedHabits, fetchedLog, fetchedTodos] = await Promise.all([
          getHabits(),
          getTodayLog(),
          getTodos()
        ]);
        setHabits(fetchedHabits);
        setLog(fetchedLog);
        setTodos(fetchedTodos);
      } catch (e) {
        console.error("Unified Dashboard Load Error", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [today]);

  // Derived state for Habits
  const scheduledHabits = useMemo(() => {
    return habits.filter(h => {
      const isComplete = !!log?.habits[h.id]?.completed;
      if (isComplete) return false;
      return isHabitScheduledToday(h, today) && h.type !== 'limiter';
    });
  }, [habits, log, today]);

  // Derived state for Todos (Current Active Todos)
  const currentTodos = useMemo(() => {
    return todos.filter(t => !t.future || t.future <= today);
  }, [todos, today]);

  // Actions for Habits
  const handleHabitComplete = async (habitId: string) => {
    try {
      setLog(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          habits: { ...prev.habits, [habitId]: { completed: true, value: 1, target: 1, completions: [{ timestamp: Date.now(), value: 1 }], timerSeconds: 0 } }
        };
      });
      await completeHabit(habitId, 1);
    } catch (e) {
      console.error(e);
    }
  };

  const handleHabitUndo = async (habitId: string) => {
    try {
      setLog(prev => {
        if (!prev) return prev;
        const newHabits = { ...prev.habits };
        delete newHabits[habitId];
        return { ...prev, habits: newHabits };
      });
      await uncompleteHabit(habitId);
    } catch (e) {
      console.error(e);
    }
  };

  // Actions for Todos
  const handleTodoComplete = async (todoId: string) => {
    try {
      const completedTodo = todos.find(t => t.id === todoId);
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
    }
  };

  const handleTodoClick = async (todoId: string) => {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;

    if (todo.type === "numbered" && todo.numbered) {
       try {
          const newCurrent = todo.numbered.current + 1;
          if (newCurrent >= todo.numbered.target) {
            handleTodoComplete(todoId);
          } else {
            setTodos(prev => prev.map(t => 
              t.id === todoId ? { ...t, numbered: { ...t.numbered!, current: newCurrent } } : t
            ));
            await incrementNumberedTodo(todoId, todo);
          }
       } catch (e) {
          console.error(e);
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

  return (
    <div className="dashboard-page">
      <div className="dashboard-page__header">
        <h1 className="t-display">[ COMMAND CENTER ]</h1>
      </div>

      <div className="dashboard-page__content">
        <div className="dashboard-split">
          
          {/* LEFT COLUMN: HABITS */}
          <div className="dashboard-column">
            <div className="dashboard-column__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="t-label">[ TODAY'S HABITS ]</h2>
              <button 
                className="t-meta" 
                style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer" }}
                onClick={() => {
                  navigate("/habits");
                  setTimeout(() => window.dispatchEvent(new CustomEvent("w:open-habit-form")), 50);
                }}
              >
                + ADD
              </button>
            </div>
            
            {scheduledHabits.length === 0 ? (
              <div className="dashboard-empty t-meta">
                All assigned habits completed!
              </div>
            ) : (
              <div className="dashboard-list">
                {scheduledHabits.map(h => (
                  <HabitCard 
                    key={h.id} 
                    habit={h} 
                    isCompletedToday={false} 
                    onComplete={() => handleHabitComplete(h.id)} 
                    onUndo={() => handleHabitUndo(h.id)}
                    onClick={() => {}}
                    currentValue={log?.habits[h.id]?.value || 0}
                  />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: TODOS */}
          <div className="dashboard-column">
            <div className="dashboard-column__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="t-label">[ ACTIVE TODOS ]</h2>
              <button 
                className="t-meta" 
                style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer" }}
                onClick={() => {
                  navigate("/todos");
                  setTimeout(() => window.dispatchEvent(new CustomEvent("w:open-todo-form")), 50);
                }}
              >
                + ADD
              </button>
            </div>

            {currentTodos.length === 0 ? (
              <div className="dashboard-empty t-meta">
                No active todos at the moment.
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
    </div>
  );
}
