import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { HabitCard } from './HabitCard/HabitCard';
import { HabitForm } from './HabitForm/HabitForm';
import { GroupManager } from './GroupManager/GroupManager';
import { HabitGroupHeader } from './HabitGroupHeader/HabitGroupHeader';
import { Habit, HabitLog, HabitGroup } from '../types';
import { HabitDetail } from './HabitDetail/HabitDetail';
import { getHabits, createHabit, deleteHabit } from '../services/habitService';
import { getGroups, createGroup } from '../services/groupService';
import { getTodayLog, completeHabit, uncompleteHabit } from '../services/logService';
import { isHabitScheduledToday, isHabitResting } from '../utils/scheduleEngine';
import { getToday } from '../../../shared/utils/dateUtils';
import { LucideIcon } from '../../../shared/components/IconPicker/LucideIcon';
import { useRiskEngine } from '../hooks/useRiskEngine';
import './HabitsPage.css';

type LayoutMode = 'default' | 'grouped' | 'custom';

export function HabitsPage() {
  const navigate = useNavigate();
  const { userDoc } = useOutletContext<{ userDoc: any }>();
  const [loading, setLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [groups, setGroups] = useState<HabitGroup[]>([]);
  const [log, setLog] = useState<HabitLog | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('default');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [deleteSubId, setDeleteSubId] = useState<string | null>(null);
  const [focusedIndex, _setFocusedIndex] = useState(0);

  const today = useMemo(() => {
    return getToday(undefined, userDoc?.settings?.dailyResetTime);
  }, [userDoc?.settings?.dailyResetTime]);

  // ── Predictive Strike Risk Engine ─────────────────────────────
  const riskScores = useRiskEngine(habits, log);

  // Load Data
  useEffect(() => {
    async function loadData() {
      try {
        const fetchedHabits = await getHabits();
        const fetchedLog = await getTodayLog();
        const fetchedGroups = await getGroups();

        setHabits(fetchedHabits);
        setGroups(fetchedGroups);
        setLog(fetchedLog);
      } catch (err) {
        console.error("HabitsPage Load Error:", err);
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
  const { scheduled, upcoming, limiters, completed } = useMemo(() => {
    const s: Habit[] = [];
    const up: Habit[] = [];
    const l: Habit[] = [];
    const c: Habit[] = [];
    
    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;

    habits.forEach(h => {
      const logEntry = log?.habits?.[h.id];
      const isComplete = !!logEntry?.completed;

      if (isComplete) {
        c.push(h);
      } else if (
        isHabitResting(h, userDoc?.settings?.dailyResetTime) ||
        (h.startDate && h.startDate > today) ||
        !isHabitScheduledToday(h, today, weeklyResetDay)
      ) {
        up.push(h);
      } else if (h.type === 'limiter') {
        l.push(h);
      } else {
        s.push(h);
      }
    });

    return { scheduled: s, upcoming: up, limiters: l, completed: c };
  }, [habits, log, today, userDoc]);

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
      const habit = habits.find(h => h.id === habitId);
      const target = habit?.metric?.targetValue ?? 1;
      // Optimistic UI
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
        const existing = newHabits[habitId];
        if (!existing || !existing.completions?.length) {
          delete newHabits[habitId];
          return { ...prev, habits: newHabits };
        }

        const newCompletions = existing.completions.slice(0, -1);
        const lastValue = existing.completions[existing.completions.length - 1].value;
        const newValue = Math.max(0, (existing.value ?? 0) - lastValue);
        const isCompleted = newValue >= (existing.target ?? 1);

        if (newCompletions.length === 0) {
          delete newHabits[habitId];
        } else {
          newHabits[habitId] = { ...existing, completions: newCompletions, value: newValue, completed: isCompleted };
        }
        return { ...prev, habits: newHabits };
      });
      await uncompleteHabit(habitId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateSubmit = async (data: any) => {
    try {
      let finalGroup = data.group;
      if (data.group && data.group.startsWith('new_') && data.newGroupName) {
        const created = await createGroup(data.newGroupName, groups.length);
        finalGroup = created.id;
        const fetchedGroups = await getGroups();
        setGroups(fetchedGroups);
      }

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
        group: finalGroup,
        startDate: data.startDate,
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
      <div className="habits-loading">
        <h1 className="t-display">[ LOADING ]</h1>
      </div>
    );
  }

  return (
    <div className="habits-page" style={{ padding: "0 24px 24px 24px" }}>
      <div className="habits-page__controls" style={{ justifyContent: 'flex-end', marginBottom: 'var(--spacing-xl)' }}>
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
            <button 
              className={`t-label preset-btn ${layoutMode === 'custom' ? 'preset-btn--active' : ''}`}
              onClick={() => setLayoutMode('custom')}
            >
              <LucideIcon name="Map" size={16} /> CUSTOM
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
            [ + NEW HABIT ]
          </button>
        </div>

      <div className="habits-page__content">
        {scheduled.length === 0 && limiters.length === 0 && completed.length === 0 && upcoming.length === 0 ? (
          <div className="habits-page__empty t-body">
            No habits yet. Create your first habit!
          </div>
        ) : (
          <div className="habits-page__layout-container">
            {layoutMode === 'default' && (
              <div className="habits-grid">
                {scheduled.map(h => (
                  <HabitCard 
                    key={h.id} 
                    habit={h} 
                    isCompletedToday={false} 
                    doneToday={h.type === "metric" && (h.period === "weekly" || h.period === "monthly" || h.period === "interval") && ((log?.habits?.[h.id]?.completions?.length ?? 0) > 0)}
                    onComplete={() => handleComplete(h.id)} 
                    onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)}
                    currentValue={log?.habits?.[h.id]?.value || 0}
                    riskScore={riskScores[h.id]}
                  />
                ))}
              </div>
            )}

            {layoutMode === 'grouped' && (
              <div className="habits-grouped">
                {groups.map(g => {
                  const groupHabits = scheduled.filter(h => h.group === g.id);
                  if (groupHabits.length === 0) return null;
                  return (
                    <HabitGroupHeader key={g.id} title={g.name} count={groupHabits.length}>
                      <div className="habits-grid">
                         {groupHabits.map(h => (
                          <HabitCard key={h.id} habit={h} isCompletedToday={false} doneToday={h.type === "metric" && (h.period === "weekly" || h.period === "monthly" || h.period === "interval") && ((log?.habits?.[h.id]?.completions?.length ?? 0) > 0)} onComplete={() => handleComplete(h.id)} onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)} currentValue={log?.habits?.[h.id]?.value || 0} riskScore={riskScores[h.id]} />
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
                        <div className="habits-grid">
                           {ungrouped.map(h => (
                            <HabitCard key={h.id} habit={h} isCompletedToday={false} doneToday={h.type === "metric" && (h.period === "weekly" || h.period === "monthly" || h.period === "interval") && ((log?.habits?.[h.id]?.completions?.length ?? 0) > 0)} onComplete={() => handleComplete(h.id)} onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)} currentValue={log?.habits?.[h.id]?.value || 0} riskScore={riskScores[h.id]} />
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

            {upcoming.length > 0 && (
              <div className="habits-section">
                <h3 className="habits-section-title t-label">[ UPCOMING ]</h3>
                <div className="habits-grid" style={{ opacity: 0.55 }}>
                  {upcoming.map(h => {
                    const isResting = isHabitResting(h, userDoc?.settings?.dailyResetTime);
                    const isFuture = h.startDate && h.startDate > today;
                    const upcomingStatus = isFuture
                      ? `STARTS ${h.startDate}`
                      : isResting
                        ? "RESTING"
                        : "NOT SCHEDULED TODAY";
                    return (
                      <HabitCard 
                        key={h.id} 
                        habit={h} 
                        isCompletedToday={false} 
                        doneToday={false}
                        onComplete={() => {}} 
                        onUndo={() => {}} 
                        onClick={() => setSelectedHabitId(h.id)}
                        currentValue={0}
                        isResting={isResting}
                        userResetTime={userDoc?.settings?.dailyResetTime}
                        upcomingStatus={upcomingStatus}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {limiters.length > 0 && (
              <div className="habits-section">
                <h3 className="habits-section-title t-label" style={{ color: 'var(--strike-red)' }}>[ LIMITERS ]</h3>
                <div className="habits-grid">
                  {limiters.map(h => (
                    <HabitCard 
                      key={h.id} 
                      habit={h} 
                      isCompletedToday={false} 
                      doneToday={h.type === "metric" && (h.period === "weekly" || h.period === "monthly" || h.period === "interval") && ((log?.habits?.[h.id]?.completions?.length ?? 0) > 0)}
                      onComplete={() => handleComplete(h.id)} 
                      onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)}
                      currentValue={log?.habits?.[h.id]?.value || 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {completed.length > 0 && (
              <HabitGroupHeader title="COMPLETED" count={completed.length} defaultExpanded={false}>
                <div className="habits-grid">
                  {completed.map(h => (
                    <HabitCard 
                      key={h.id} 
                      habit={h} 
                      isCompletedToday={true} 
                      doneToday={false}
                      onComplete={() => handleComplete(h.id)} 
                      onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)}
                      currentValue={log?.habits?.[h.id]?.value || 0}
                    />
                  ))}
                </div>
              </HabitGroupHeader>
            )}
          </div>
        )}
      </div>

      {isFormOpen && (
        <div className="habits-modal-overlay">
          <div className="habits-modal-content">
            <HabitForm 
              groups={groups} 
              onSubmit={handleCreateSubmit} 
              onCancel={() => setIsFormOpen(false)} 
              userResetTime={userDoc?.settings?.dailyResetTime}
            />
          </div>
        </div>
      )}

      {isGroupManagerOpen && (
        <div className="habits-modal-overlay">
          <div className="habits-modal-content" style={{ padding: "24px", background: "var(--bg-elevated)", borderRadius: "8px", maxWidth: "600px", width: "100%", maxHeight: "90vh", overflowY: "auto", border: "1px solid var(--border-subtle)" }}>
            <GroupManager onClose={() => setIsGroupManagerOpen(false)} />
          </div>
        </div>
      )}

      {selectedHabitId && habits.find(h => h.id === selectedHabitId) && (
        <HabitDetail
          habit={habits.find(h => h.id === selectedHabitId)!}
          onClose={() => setSelectedHabitId(null)}
          userResetTime={userDoc?.settings?.dailyResetTime}
          onUpdate={(updated) => {
            if (updated.isArchived) {
              setHabits(prev => prev.filter(h => h.id !== updated.id));
            } else {
              setHabits(prev => prev.map(h => h.id === updated.id ? updated : h));
            }
          }}
          onDeleteRequest={async (habit) => {
            if (window.confirm("PERMANENTLY PURGE HABIT?")) {
              try {
                await deleteHabit(habit.id);
                setHabits(prev => prev.filter(h => h.id !== habit.id));
                setSelectedHabitId(null);
                navigate('/habits');
              } catch (e) {
                console.error("Failed to delete habit", e);
              }
            }
          }}
        />
      )}
    </div>
  );
}
