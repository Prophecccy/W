import { useState, useEffect } from "react";
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

type LayoutMode = 'default' | 'grouped';

export function TodosPage() {
  const [activeTodos, setActiveTodos] = useState<Todo[]>([]);
  const [completedTodos, setCompletedTodos] = useState<Todo[]>([]);
  const [intervalHabits, setIntervalHabits] = useState<(Habit & { nextDue: string })[]>([]);
  const [groups, setGroups] = useState<HabitGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('default');

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

      const today = getToday();
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

  const handleComplete = async (todoId: string) => {
    try {
      // Optimistic update
      const completedTodo = activeTodos.find(t => t.id === todoId);
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
            handleComplete(todoId);
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
       // standard - maybe open edit mode, but for now we just allow holding to complete
    }
  };

  const today = getToday();
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
    <div className="todos-page" style={{ padding: "24px", maxWidth: "800px", margin: "0 auto", height: "100%", display: "flex", flexDirection: "column", gap: "32px", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="t-body" style={{ color: "var(--text-muted)" }}>[ TODOS ]</h1>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <button 
              className={`t-label ${layoutMode === 'default' ? '' : 't-meta'}`}
              style={{ background: "none", border: "none", color: layoutMode === 'default' ? "var(--text-main)" : "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
              onClick={() => setLayoutMode('default')}
            >
              <LucideIcon name="List" size={16} /> DEFAULT
            </button>
            <button 
              className={`t-label ${layoutMode === 'grouped' ? '' : 't-meta'}`}
              style={{ background: "none", border: "none", color: layoutMode === 'grouped' ? "var(--text-main)" : "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
              onClick={() => setLayoutMode('grouped')}
            >
              <LucideIcon name="Folder" size={16} /> GROUPED
            </button>
          </div>
          <button 
            onClick={() => setIsFormOpen(true)}
            style={{ background: "var(--accent)", color: "var(--bg-base)", border: "none", padding: "8px 16px", cursor: "pointer" }}
            className="t-label"
          >
            [ NEW TODO ]
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="t-meta" style={{ textAlign: "center", marginTop: "40px", color: "var(--text-muted)" }}>...</div>
      ) : (
        <>
          <section>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {currentTodos.length === 0 ? (
                <div className="t-meta" style={{ color: "var(--text-muted)", padding: "24px", textAlign: "center", border: "1px dashed var(--border-subtle)" }}>
                  [ NO ACTIVE TODOS ]
                </div>
              ) : (
                layoutMode === "default" ? (
                  currentTodos.map(todo => (
                    <TodoCard 
                      key={todo.id} 
                      todo={todo} 
                      onComplete={() => handleComplete(todo.id)}
                      onClick={() => handleCardClick(todo.id)}
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
                              />
                            ))}
                          </div>
                        </HabitGroupHeader>
                      );
                    })}
                    {(() => {
                       const ungrouped = currentTodos.filter(t => !t.group);
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
                                />
                              ))}
                            </div>
                          </HabitGroupHeader>
                       )
                    })()}
                  </div>
                )
              )}
            </div>
          </section>

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
            <section style={{ marginTop: "auto", borderTop: "1px solid var(--border-default)", paddingTop: "16px" }}>
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
        </>
      )}
    </div>
  );
}
