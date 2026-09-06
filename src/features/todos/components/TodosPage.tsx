import { useState, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { Todo } from "../types";
import { HabitGroup } from "../../habits/types";
import { getTodos, getCompletedTodos, completeTodo, completeNumberedTodoFull, incrementNumberedTodo, deleteTodo } from "../services/todoService";
import { getGroups } from "../../habits/services/groupService";
import { HabitGroupHeader } from "../../habits/components/HabitGroupHeader/HabitGroupHeader";
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
  const [groups, setGroups] = useState<HabitGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('default');
  const [expandedTodoIds, setExpandedTodoIds] = useState<Record<string, boolean>>({});
  const [todoToEdit, setTodoToEdit] = useState<Todo | undefined>(undefined);
  const [undoTodo, setUndoTodo] = useState<Todo | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const skipNextRefresh = useRef(false);

  const loadData = async (isBackground = false) => {
    if (!isBackground) {
      setIsLoading(true);
    }
    try {
      const [todos, completed, fetchedGroups] = await Promise.all([
        getTodos(),
        getCompletedTodos(),
        getGroups(),
      ]);

      setActiveTodos(todos);
      setCompletedTodos(completed);
      setGroups(fetchedGroups);
    } catch (e) {
      console.error(e);
    } finally {
      if (!isBackground) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [userDoc?.settings?.dailyResetTime]);

  // ── Custom event listener (N key / CommandPalette) ──
  useEffect(() => {
    const handleOpenForm = () => setIsFormOpen(true);
    const handleSkipRefresh = () => { skipNextRefresh.current = true; };
    window.addEventListener("w:open-todo-form", handleOpenForm);
    window.addEventListener("w:skip-todo-refresh", handleSkipRefresh);

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("action") === "new") {
      setIsFormOpen(true);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }

    return () => {
      window.removeEventListener("w:open-todo-form", handleOpenForm);
      window.removeEventListener("w:skip-todo-refresh", handleSkipRefresh);
    };
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
          if (active) loadData(true);
        });
        const unsubTodo = await listen("widget-todo-updated", () => {
          if (active) {
            if (skipNextRefresh.current) {
              skipNextRefresh.current = false;
              return;
            }
            loadData(true);
          }
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

  useEffect(() => {
    if (showUndoToast) {
      const timer = setTimeout(() => {
        setShowUndoToast(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showUndoToast]);

  const handleComplete = async (todoId: string, updatedTodo?: Todo) => {
    try {
      // Optimistic update
      const completedTodo = updatedTodo || activeTodos.find(t => t.id === todoId);
      if (completedTodo) {
        setActiveTodos(prev => prev.filter(t => t.id !== todoId));
        setCompletedTodos(prev => [{...completedTodo, status: "done", completedAt: Date.now()}, ...prev]);
        
        // Skip the next Tauri event re-fetch since we initiated this change
        skipNextRefresh.current = true;

        if (completedTodo.type === "numbered") {
           await completeNumberedTodoFull(todoId, completedTodo);
        } else {
           await completeTodo(todoId);
        }

        // Show undo toast
        setUndoTodo(completedTodo);
        setShowUndoToast(true);
      }
    } catch (e) {
      console.error(e);
      skipNextRefresh.current = false;
      loadData(true); // revert silently or update
    }
  };

  const handleUndoComplete = async () => {
    if (!undoTodo) return;
    try {
      const todoId = undoTodo.id;
      const { updateTodo } = await import("../services/todoService");
      skipNextRefresh.current = true;
      await updateTodo(todoId, { status: "active", completedAt: null });
      
      setCompletedTodos(prev => prev.filter(t => t.id !== todoId));
      setActiveTodos(prev => [...prev, { ...undoTodo, status: "active" }]);
      
      setUndoTodo(null);
      setShowUndoToast(false);
    } catch (e) {
      console.error("Failed to undo todo completion:", e);
      skipNextRefresh.current = false;
    }
  };

  const handleReactivateCompleted = async (todo: Todo) => {
    try {
      const todoId = todo.id;
      const { updateTodo } = await import("../services/todoService");
      skipNextRefresh.current = true;
      await updateTodo(todoId, { status: "active", completedAt: null });
      
      setCompletedTodos(prev => prev.filter(t => t.id !== todoId));
      setActiveTodos(prev => [...prev, { ...todo, status: "active" }]);
    } catch (e) {
      console.error("Failed to reactivate completed todo:", e);
      skipNextRefresh.current = false;
    }
  };

  const handleDelete = async (todoId: string) => {
    const { confirmDialog } = await import("../../../shared/utils/tauri");
    if (await confirmDialog("Are you sure you want to delete this todo?")) {
      try {
        // Optimistic delete
        setActiveTodos(prev => prev.filter(t => t.id !== todoId));
        skipNextRefresh.current = true;
        await deleteTodo(todoId);
      } catch (e) {
        console.error(e);
        skipNextRefresh.current = false;
        loadData(true);
      }
    }
  };

  const handleEdit = (todo: Todo) => {
    setTodoToEdit(todo);
    setIsFormOpen(true);
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
            const updatedTodo: Todo = {
              ...todo,
              numbered: { ...todo.numbered, current: newCurrent }
            };
            setActiveTodos(prev => prev.map(t => 
              t.id === todoId ? updatedTodo : t
            ));
            await incrementNumberedTodo(todoId, updatedTodo);
          }
       } catch (e) {
          console.error(e);
          loadData(true);
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
      <div className="todos-page" style={{ height: "100%", overflowY: "auto" }}>
         <TodoForm 
            groups={groups} 
            onClose={() => {
              setIsFormOpen(false);
              setTodoToEdit(undefined);
            }} 
            onSuccess={() => loadData(true)} 
            dailyResetTime={userDoc?.settings?.dailyResetTime}
            todoToEdit={todoToEdit}
          />
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
                        onDelete={() => handleDelete(todo.id)}
                        onEdit={() => handleEdit(todo)}
                        onToggleExpand={() => setExpandedTodoIds(prev => ({ ...prev, [todo.id]: !prev[todo.id] }))}
                        expanded={!!expandedTodoIds[todo.id]}
                        dailyResetTime={userDoc?.settings?.dailyResetTime}
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
                                  onDelete={() => handleDelete(todo.id)}
                                  onEdit={() => handleEdit(todo)}
                                  onToggleExpand={() => setExpandedTodoIds(prev => ({ ...prev, [todo.id]: !prev[todo.id] }))}
                                  expanded={!!expandedTodoIds[todo.id]}
                                  dailyResetTime={userDoc?.settings?.dailyResetTime}
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
                                    onDelete={() => handleDelete(todo.id)}
                                    onEdit={() => handleEdit(todo)}
                                    onToggleExpand={() => setExpandedTodoIds(prev => ({ ...prev, [todo.id]: !prev[todo.id] }))}
                                    expanded={!!expandedTodoIds[todo.id]}
                                    dailyResetTime={userDoc?.settings?.dailyResetTime}
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
                  {futureTodos.length > 0 && (
                    <section>
                       <h2 className="t-label" style={{ color: "var(--text-muted)", marginBottom: "16px" }}>[ UPCOMING ]</h2>
                       <div style={{ display: "flex", flexDirection: "column", gap: "12px", opacity: 0.6 }}>
                         {futureTodos.map(todo => (
                           <TodoCard 
                             key={todo.id} 
                             todo={todo} 
                             onComplete={() => handleComplete(todo.id)}
                             onClick={() => handleCardClick(todo.id)}
                             onDelete={() => handleDelete(todo.id)}
                             onEdit={() => handleEdit(todo)}
                             onToggleExpand={() => setExpandedTodoIds(prev => ({ ...prev, [todo.id]: !prev[todo.id] }))}
                             expanded={!!expandedTodoIds[todo.id]}
                             dailyResetTime={userDoc?.settings?.dailyResetTime}
                           />
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
                         <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px", opacity: 0.7 }}>
                           {completedTodos.map(todo => (
                             <div 
                               key={todo.id} 
                               style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", border: "1px solid var(--border-subtle)", borderRadius: "4px", cursor: "pointer" }}
                               onClick={() => handleReactivateCompleted(todo)}
                               title="Click to reactivate todo"
                             >
                               <LucideIcon name="RefreshCw" size={16} style={{ color: "var(--text-muted)", opacity: 0.7 }} />
                               <span className="t-body" style={{ textDecoration: "line-through", color: "var(--text-muted)", flex: 1 }}>{todo.title}</span>
                               <span className="t-meta" style={{ color: "var(--text-muted)", fontSize: "10px" }}>[ REACTIVATE ]</span>
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

      {showUndoToast && undoTodo && (
        <div className="habits-undo-toast" style={{
          position: "fixed",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--accent)",
          padding: "12px 24px",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          zIndex: 1000,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          animation: "todoFormSlideUp 0.2s ease-out"
        }}>
          <span style={{ color: "var(--text-primary)" }}>[ TODO COMPLETED ] - {undoTodo.title}</span>
          <button 
            onClick={handleUndoComplete} 
            className="t-label" 
            style={{ 
              background: "none", 
              border: "none", 
              color: "var(--accent)", 
              cursor: "pointer", 
              padding: 0,
              textDecoration: "underline" 
            }}
          >
            [ UNDO ]
          </button>
        </div>
      )}
    </div>
  );
}
