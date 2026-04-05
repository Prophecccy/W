import { useState, useEffect, useMemo, useCallback } from 'react';
import { HabitCard } from './HabitCard/HabitCard';
import { HabitForm } from './HabitForm/HabitForm';
import { DailyNote } from './DailyNote/DailyNote';
import { HabitGroupHeader } from './HabitGroupHeader/HabitGroupHeader';
import { Habit, HabitLog, HabitGroup } from '../types';
import { HabitDetail } from './HabitDetail/HabitDetail';
import { getHabits, createHabit, deleteHabit } from '../services/habitService';
import { getGroups } from '../services/groupService';
import { getTodayLog, completeHabit, uncompleteHabit } from '../services/logService';
import { isHabitScheduledToday } from '../utils/scheduleEngine';
import { getToday } from '../../../shared/utils/dateUtils';
import { LucideIcon } from '../../../shared/components/IconPicker/LucideIcon';
import './DashboardPage.css';

type LayoutMode = 'default' | 'grouped' | 'custom';

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [groups, setGroups] = useState<HabitGroup[]>([]);
  const [log, setLog] = useState<HabitLog | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('default');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [deleteSubId, setDeleteSubId] = useState<string | null>(null);
  const [focusedIndex, _setFocusedIndex] = useState(0);

  const today = getToday();

  // Load Data
  useEffect(() => {
    async function loadData() {
      try {
        const fetchedHabits = await getHabits();
        const fetchedLog = await getTodayLog();
        
        const processHabits = fetchedHabits.map(h => {
           return h;
        });

        const fetchedGroups = await getGroups();

        setHabits(processHabits);
        setGroups(fetchedGroups);
        setLog(fetchedLog);
      } catch (err) {
        console.error("Dashboard Load Error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [today]);

  // ── Custom event listeners (from Layout keyboard shortcuts / CommandPalette) ──
  useEffect(() => {
    const handleOpenForm = () => setIsFormOpen(true);
    const handleSelectHabit = (e: Event) => {
      const habitId = (e as CustomEvent).detail;
      if (habitId) setSelectedHabitId(habitId);
    };

    window.addEventListener("w:open-habit-form", handleOpenForm);
    window.addEventListener("w:select-habit", handleSelectHabit);

    return () => {
      window.removeEventListener("w:open-habit-form", handleOpenForm);
      window.removeEventListener("w:select-habit", handleSelectHabit);
    };
  }, []);

  // Derived State Filters
  const { scheduled, unscheduled, limiters, completed } = useMemo(() => {
    const s: Habit[] = [];
    const u: Habit[] = [];
    const l: Habit[] = [];
    const c: Habit[] = [];

    habits.forEach(h => {
      const logEntry = log?.habits[h.id];
      const isComplete = !!logEntry?.completed;

      if (isComplete) {
        c.push(h);
      } else if (h.type === 'limiter') {
        l.push(h);
      } else if (isHabitScheduledToday(h, today)) {
        s.push(h);
      } else {
        u.push(h);
      }
    });

    return { scheduled: s, unscheduled: u, limiters: l, completed: c };
  }, [habits, log, today]);

  // ── Space key quick-complete (complete focused scheduled habit) ──
  const handleQuickComplete = useCallback(() => {
    if (scheduled.length === 0) return;
    const clampedIndex = Math.min(focusedIndex, scheduled.length - 1);
    const target = scheduled[clampedIndex];
    if (target) {
      handleComplete(target.id);
    }
  }, [scheduled, focusedIndex]);

  useEffect(() => {
    const onQuickComplete = () => handleQuickComplete();
    window.addEventListener("w:quick-complete", onQuickComplete);
    return () => window.removeEventListener("w:quick-complete", onQuickComplete);
  }, [handleQuickComplete]);

  // Actions
  const handleComplete = async (habitId: string) => {
    try {
      // Optimistic UI
      setLog(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          habits: {
            ...prev.habits,
            [habitId]: { completed: true, value: 1, target: 1, completions: [{ timestamp: Date.now(), value: 1 }], timerSeconds: 0 }
          }
        };
      });
      await completeHabit(habitId, 1);
    } catch (e) {
      console.error(e);
      // Rollback UI would happen here ideally
    }
  };

  const handleUndo = async (habitId: string) => {
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

  const handleCreateSubmit = async (data: any) => {
    try {
      const newHabit = {
        title: data.title,
        description: data.description,
        icon: data.icon,
        color: data.color,
        period: data.period,
        type: data.type,
        frequency: data.frequency,
        daysOfWeek: data.daysOfWeek,
        intervalDays: data.intervalDays,
        metric: data.metric,
        duration: data.duration,
        group: data.group,
        isActive: true,
        order: habits.length,
        createdAt: Date.now(),
        lastCompletedDate: null,
        archivedAt: null,
        level: 0,
        currentStreak: 0,
        longestStreak: 0,
        totalCompletions: 0,
        levelProgress: 0
      };

      const id = await createHabit(newHabit as Omit<Habit, 'id' | 'uid'>);
      setHabits(prev => [...prev, { ...newHabit, id, uid: '' } as unknown as Habit]);
      
      if (deleteSubId) {
        try {
          await deleteHabit(deleteSubId);
          setHabits(prev => prev.filter(h => h.id !== deleteSubId));
        } catch (e) {
          console.error("Failed to delete substituted habit", e);
        }
        setDeleteSubId(null);
      }
      
      setIsFormOpen(false);
    } catch (e) {
      console.error(e);
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
        <h1 className="t-display">[ TODAY ]</h1>
        <div className="dashboard-page__controls">
          <div className="dashboard-page__layout-toggle">
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
            <button 
              className={`t-label preset-btn ${layoutMode === 'custom' ? 'preset-btn--active' : ''}`}
              onClick={() => setLayoutMode('custom')}
            >
              <LucideIcon name="Map" size={16} /> CUSTOM
            </button>
          </div>
          <button className="dashboard-page__add-btn t-label" onClick={() => setIsFormOpen(true)}>
            [ + NEW HABIT ]
          </button>
        </div>
      </div>

      <div className="dashboard-page__content">
        {scheduled.length === 0 && limiters.length === 0 && completed.length === 0 && unscheduled.length === 0 ? (
          <div className="dashboard-page__empty t-body">
            No habits yet. Create your first habit!
          </div>
        ) : (
          <div className="dashboard-grid">
            {layoutMode === 'default' && (
              <>
                {scheduled.map(h => (
                  <HabitCard 
                    key={h.id} 
                    habit={h} 
                    isCompletedToday={false} 
                    onComplete={() => handleComplete(h.id)} 
                    onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)}
                    currentValue={log?.habits[h.id]?.value || 0}
                  />
                ))}
              </>
            )}

            {layoutMode === 'grouped' && (
              <div className="dashboard-grouped">
                {groups.map(g => {
                  const groupHabits = scheduled.filter(h => h.group === g.id);
                  if (groupHabits.length === 0) return null;
                  return (
                    <HabitGroupHeader key={g.id} title={g.name} count={groupHabits.length}>
                      <div className="dashboard-grid">
                         {groupHabits.map(h => (
                          <HabitCard key={h.id} habit={h} isCompletedToday={false} onComplete={() => handleComplete(h.id)} onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)} currentValue={log?.habits[h.id]?.value || 0} />
                        ))}
                      </div>
                    </HabitGroupHeader>
                  );
                })}
                {/* Ungrouped Scheduled */}
                {(() => {
                   const ungrouped = scheduled.filter(h => !h.group);
                   if (ungrouped.length === 0) return null;
                   return (
                      <HabitGroupHeader title="UNGROUPED" count={ungrouped.length}>
                        <div className="dashboard-grid">
                           {ungrouped.map(h => (
                            <HabitCard key={h.id} habit={h} isCompletedToday={false} onComplete={() => handleComplete(h.id)} onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)} currentValue={log?.habits[h.id]?.value || 0} />
                          ))}
                        </div>
                      </HabitGroupHeader>
                   )
                })()}
              </div>
            )}

            {layoutMode === 'custom' && (
              <div className="t-meta" style={{ padding: '24px 0', opacity: 0.5 }}>
                 Custom drag-and-drop sort mode active. (Reordering handled by parent wrapper in full implementation)
              </div>
            )}

            {unscheduled.length > 0 && (
              <div className="dashboard-section">
                <h3 className="dashboard-section-title t-label">[ NOT SCHEDULED TODAY ]</h3>
                 <div className="dashboard-grid dashboard-grid--dimmed">
                  {unscheduled.map(h => (
                    <HabitCard 
                      key={h.id} 
                      habit={h} 
                      isCompletedToday={false} 
                      onComplete={() => handleComplete(h.id)} 
                      onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)}
                      currentValue={log?.habits[h.id]?.value || 0}
                    />
                  ))}
                 </div>
              </div>
            )}

            {limiters.length > 0 && (
              <div className="dashboard-section">
                <h3 className="dashboard-section-title t-label" style={{ color: 'var(--strike-red)' }}>[ LIMITERS ]</h3>
                <div className="dashboard-grid">
                  {limiters.map(h => (
                    <HabitCard 
                      key={h.id} 
                      habit={h} 
                      isCompletedToday={false} 
                      onComplete={() => handleComplete(h.id)} 
                      onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)}
                      currentValue={log?.habits[h.id]?.value || 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {completed.length > 0 && (
              <HabitGroupHeader title="COMPLETED" count={completed.length} defaultExpanded={false}>
                <div className="dashboard-grid">
                  {completed.map(h => (
                    <HabitCard 
                      key={h.id} 
                      habit={h} 
                      isCompletedToday={true} 
                      onComplete={() => handleComplete(h.id)} 
                      onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)}
                      currentValue={log?.habits[h.id]?.value || 0}
                    />
                  ))}
                </div>
              </HabitGroupHeader>
            )}
          </div>
        )}
      </div>

      <div className="dashboard-page__footer">
        <DailyNote initialNote={log?.notes || ''} />
      </div>

      {isFormOpen && (
        <div className="dashboard-modal-overlay">
          <div className="dashboard-modal-content">
            <HabitForm 
              groups={groups} 
              onSubmit={handleCreateSubmit} 
              onCancel={() => setIsFormOpen(false)} 
            />
          </div>
        </div>
      )}

      {selectedHabitId && habits.find(h => h.id === selectedHabitId) && (
        <HabitDetail
          habit={habits.find(h => h.id === selectedHabitId)!}
          onClose={() => setSelectedHabitId(null)}
          onUpdate={(updated) => setHabits(prev => prev.map(h => h.id === updated.id ? updated : h))}
          onDeleteRequest={(habit) => {
            if (confirm("To delete this habit, you must replace it by creating a new habit or to-do. Ready?")) {
              setSelectedHabitId(null);
              setDeleteSubId(habit.id);
              setIsFormOpen(true);
            }
          }}
        />
      )}
    </div>
  );
}
