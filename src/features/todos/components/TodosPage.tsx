import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Todo } from "../types";
import { Habit, HabitGroup } from "../../habits/types";
import { getTodos, getCompletedTodos, completeTodo, completeNumberedTodoFull, incrementNumberedTodo } from "../services/todoService";
import { getHabits } from "../../habits/services/habitService";
import { getGroups } from "../../habits/services/groupService";
import { HabitGroupHeader } from "../../habits/components/HabitGroupHeader/HabitGroupHeader";
import { getNextDueDate } from "../../habits/utils/scheduleEngine";
import { TodoCard } from "./TodoCard/TodoCard";
import { TodoForm } from "./TodoForm/TodoForm";
import { getToday } from "../../../shared/utils/dateUtils";
import { LucideIcon } from "../../../shared/components/IconPicker/LucideIcon";
import { GroupManager } from "../../habits/components/GroupManager/GroupManager";
import "../../habits/components/HabitsPage.css";

type LayoutMode = 'default' | 'grouped';

export function TodosPage() {
  const { userDoc } = useOutletContext<{ userDoc: any }>();
  const [activeTodos, setActiveTodos] = useState<Todo[]>([]);
  const [completedTodos, setCompletedTodos] = useState<Todo[]>([]);
  const [intervalHabits, setIntervalHabits] = useState<(Habit & { nextDue: string })[]>([]);
  const [groups, setGroups] = useState<HabitGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('default');
  const [expandedTodoIds, setExpandedTodoIds] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [todos, completed, habits, fetchedGroups] = await Promise.all([
        getTodos(),
        getCompletedTodos(),
        getHabits(),
        getGroups(),
      ]);

      setActiveTodos(todos);
      setCompletedTodos(completed);
      setGroups(fetchedGroups);

      const today = getToday(undefined, userDoc?.settings?.dailyResetTime);
      const upcomingIntervals = habits
        .filter(h => h.period === "interval")
        .map(h => ({ ...h, nextDue: getNextDueDate(h) || "" }))
        .filter(h => h.nextDue && h.nextDue > today);
        
      setIntervalHabits(upcomingIntervals);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ── Custom event listener (N key / CommandPalette) ──
  useEffect(() => {
    const handleOpenForm = () => setIsFormOpen(true);
    window.addEventListener("w:open-todo-form", handleOpenForm);
    return () => window.removeEventListener("w:open-todo-form", handleOpenForm);
  }, []);

  useEffect(() => {
    let active = true;
    let unsubPromise: Promise<(() => void)[]> | null = null;

    async function setupListeners() {
      try {
        const { isTauri } = await import("../../../shared/utils/tauri");
        if (!isTauri() || !active) return [];

        const { listen } = await import("@tauri-apps/api/event");
        if (!active) return [];

        const unsubHabit = await listen("widget-habit-updated", () => {
          if (active) loadData();
        });
        const unsubTodo = await listen("widget-todo-updated", () => {
          if (active) loadData();
        });

        return [unsubHabit, unsubTodo];
      } catch (err) {
        console.error("Failed to setup Tauri listeners in TodosPage:", err);
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

  const handleComplete = async (todoId: string, updatedTodo?: Todo) => {
    try {
      // Optimistic update
      const completedTodo = updatedTodo || activeTodos.find(t => t.id === todoId);
      if (completedTodo) {
        setActiveTodos(prev => prev.filter(t => t.id !== todoId));
        setCompletedTodos(prev => [{...completedTodo, status: "done", completedAt: Date.now()}, ...prev]);
        
        if (completedTodo.type === "numbered") {
           await completeNumberedTodoFull(todoId, completedTodo);
        } else {
           await completeTodo(todoId);
        }
      }
    } catch (e) {
      console.error(e);
      loadData(); // revert
    }
  };

  const handleCardClick = async (todoId: string) => {
    const todo = activeTodos.find(t => t.id === todoId);
    if (!todo) return;

    if (todo.type === "numbered" && todo.numbered) {
       try {
          const newCurrent = todo.numbered.current + 1;
          
          if (newCurrent >= todo.numbered.target) {
            const finishedTodo: Todo = {
              ...todo,
              numbered: { ...todo.numbered, current: newCurrent }
            };
            handleComplete(todoId, finishedTodo);
          } else {
            // Optimistic increment
            setActiveTodos(prev => prev.map(t => 
              t.id === todoId 
                ? { ...t, numbered: { ...t.numbered!, current: newCurrent } } 
                : t
            ));
            await incrementNumberedTodo(todoId, todo);
          }
       } catch (e) {
          console.error(e);
          loadData();
       }
    } else {
       // Toggle description expansion
       setExpandedTodoIds(prev => ({
         ...prev,
         [todoId]: !prev[todoId]
       }));
    }
  };

  const today = getToday(undefined, userDoc?.settings?.dailyResetTime);
  const currentTodos = activeTodos.filter(t => !t.future || t.future <= today);
  const futureTodos = activeTodos.filter(t => t.future && t.future > today);

  if (isFormOpen) {
    return (
      <div className="todos-page" style={{ height: "100%" }}>
         <TodoForm groups={groups} onClose={() => setIsFormOpen(false)} onSuccess={loadData} />
      </div>
    );
  }

  return (
    <div className="todos-page" style={{ 
      height: "100%", 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "stretch",
      overflow: "hidden" 
    }}>
      <header className="habits-page__controls" style={{ 
        display: "flex",
        justifyContent: 'flex-end', 
        alignItems: 'flex-start',
        gap: '16px',
        width: '100%',
        padding: "0 24px",
        marginBottom: '24px',
        flexShrink: 0
      }}>
        <div className="habits-page__layout-toggle">
          <button 
            className={`t-label preset-btn ${layoutMode === 'default' ? 'preset-btn--active' : ''}`}
            onClick={() => setLayoutMode('default')}
          >
            <LucideIcon name="List" size={16} /> DEFAULT
          </button>
          <button 
            className={`t-label preset-btn ${layoutMode === 'grouped' ? 'preset-btn--active' : ''}`}
            onClick={() => setLayoutMode('grouped')}
          >
            <LucideIcon name="Folder" size={16} /> GROUPED
          </button>
        </div>
        <button 
          className="btn-action btn-action--secondary" 
          onClick={() => setIsGroupManagerOpen(true)}
        >
          [ GROUPS ]
        </button>
        <button 
          className="btn-action btn-action--primary" 
          onClick={() => setIsFormOpen(true)}
        >
          [ + NEW TODO ]
        </button>
      </header>

      <div className="habits-page__content" style={{ 
        flex: 1, 
        display: "flex", 
        flexDirection: "column",
        overflowY: "auto",
        padding: "0 24px 24px 24px"
      }}>
        {isLoading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="t-meta" style={{ color: "var(--text-muted)" }}>...</div>
          </div>
        ) : (
          <>
            {currentTodos.length === 0 ? (
              <div className="todos-empty-wrapper" style={{ 
                flex: 1, 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                width: "100%" 
              }}>
                <div className="t-meta" style={{ 
                  color: "var(--text-muted)", 
                  padding: "48px", 
                  textAlign: "center", 
                  border: "1px dashed var(--border-subtle)",
                  width: "100%",
                  maxWidth: "800px"
                }}>
                  [ NO ACTIVE TODOS ]
                </div>
              </div>
            ) : (
              <div style={{ maxWidth: "800px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column" }}>
                <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {layoutMode === "default" ? (
                    currentTodos.map(todo => (
                      <TodoCard 
                        key={todo.id} 
                        todo={todo} 
                        onComplete={() => handleComplete(todo.id)}
                        onClick={() => handleCardClick(todo.id)}
                        expanded={!!expandedTodoIds[todo.id]}
                      />
                    ))
                  ) : (
                    <div className="habits-grouped">
                      {groups.map(g => {
                        const groupTodos = currentTodos.filter(t => t.group === g.id);
                        if (groupTodos.length === 0) return null;
                        return (
                          <HabitGroupHeader key={g.id} title={g.name} count={groupTodos.length}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                               {groupTodos.map(todo => (
                                <TodoCard 
                                  key={todo.id} 
                                  todo={todo} 
                                  onComplete={() => handleComplete(todo.id)}
                                  onClick={() => handleCardClick(todo.id)}
                                  expanded={!!expandedTodoIds[todo.id]}
                                />
                              ))}
                            </div>
                          </HabitGroupHeader>
                        );
                      })}
                      {(() => {
                         const ungrouped = currentTodos.filter(t => !t.group || !groups.some(g => g.id === t.group));
                         if (ungrouped.length === 0) return null;
                         return (
                            <HabitGroupHeader title="UNGROUPED" count={ungrouped.length}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                 {ungrouped.map(todo => (
                                  <TodoCard 
                                    key={todo.id} 
                                    todo={todo} 
                                    onComplete={() => handleComplete(todo.id)}
                                    onClick={() => handleCardClick(todo.id)}
                                    expanded={!!expandedTodoIds[todo.id]}
                                  />
                                ))}
                              </div>
                            </HabitGroupHeader>
                         )
                      })()}
                    </div>
                  )}
                </section>
 
                <div style={{ display: "flex", flexDirection: "column", gap: "32px", marginTop: "32px" }}>
                  {(futureTodos.length > 0 || intervalHabits.length > 0) && (
                    <section>
                       <h2 className="t-label" style={{ color: "var(--text-muted)", marginBottom: "16px" }}>[ UPCOMING ]</h2>
                       <div style={{ display: "flex", flexDirection: "column", gap: "12px", opacity: 0.6 }}>
                         {futureTodos.map(todo => (
                           <TodoCard 
                             key={todo.id} 
                             todo={todo} 
                             onComplete={() => handleComplete(todo.id)}
                             onClick={() => handleCardClick(todo.id)}
                             expanded={!!expandedTodoIds[todo.id]}
                           />
                         ))}
                         
                         {intervalHabits.map(habit => (
                           <div key={habit.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px", border: "1px solid var(--border-default)", borderRadius: "4px", background: "var(--bg-elevated)" }}>
                              <LucideIcon name={habit.icon} size={20} style={{ color: habit.color }} />
                              <span className="t-body">{habit.title}</span>
                              <span className="badge t-meta" style={{ marginLeft: "auto" }}>[ DUE {habit.nextDue} ]</span>
                           </div>
                         ))}
                       </div>
                    </section>
                  )}

                  {completedTodos.length > 0 && (
                    <section style={{ borderTop: "1px solid var(--border-default)", paddingTop: "16px", marginBottom: "32px" }}>
                      <button 
                        onClick={() => setShowCompleted(!showCompleted)}
                        style={{ background: "none", border: "none", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", width: "100%" }}
                        className="t-label"
                      >
                        <LucideIcon name={showCompleted ? "ChevronUp" : "ChevronDown"} size={16} />
                        [ COMPLETED ({completedTodos.length}) ]
                        <span style={{ marginLeft: "auto", opacity: 0.5 }}>AUTO-PURGES AFTER 50</span>
                      </button>

                      {showCompleted && (
                         <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px", opacity: 0.5 }}>
                           {completedTodos.map(todo => (
                             <div key={todo.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", border: "1px solid var(--border-subtle)", borderRadius: "4px" }}>
                               <LucideIcon name="Check" size={16} style={{ color: "var(--text-muted)" }} />
                               <span className="t-body" style={{ textDecoration: "line-through", color: "var(--text-muted)" }}>{todo.title}</span>
                             </div>
                           ))}
                         </div>
                      )}
                    </section>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {isGroupManagerOpen && (
        <div className="habits-modal-overlay" onClick={() => setIsGroupManagerOpen(false)}>
          <div className="habits-modal-content" onClick={e => e.stopPropagation()}>
            <GroupManager onClose={() => setIsGroupManagerOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
