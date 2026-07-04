import { useState, useEffect, useMemo, useCallback } from 'react';
import { isTauri, confirmDialog } from '../../../shared/utils/tauri';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { HabitCard } from './HabitCard/HabitCard';
import { HabitForm } from './HabitForm/HabitForm';
import { GroupManager } from './GroupManager/GroupManager';
import { HabitGroupHeader } from './HabitGroupHeader/HabitGroupHeader';
import { Habit, HabitLog, HabitGroup } from '../types';
import { HabitDetail } from './HabitDetail/HabitDetail';
import { getHabits, createHabit, deleteHabit } from '../services/habitService';
import { getGroups, createGroup, sanitizeGroupName } from '../services/groupService';
import { getTodayLog, completeHabit, uncompleteHabit, getLogRange } from '../services/logService';
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
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [periodLogs, setPeriodLogs] = useState<HabitLog[]>([]);

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
        const fetchedLog = await getTodayLog(userDoc?.settings?.dailyResetTime);
        const fetchedGroups = await getGroups();

        setHabits(fetchedHabits);
        setGroups(fetchedGroups);
        setLog(fetchedLog);

        const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
        let minStart = today;
        let hasMulti = false;
        for (const h of fetchedHabits) {
          if (!isMultiDayMetric(h)) continue;
          hasMulti = true;
          const start = getPeriodStart(h, today, weeklyResetDay);
          if (start < minStart) minStart = start;
        }

        if (hasMulti) {
          const logs = await getLogRange(minStart, today);
          setPeriodLogs(logs);
        } else {
          setPeriodLogs([]);
        }
      } catch (err) {
        console.error("HabitsPage Load Error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [today, refreshKey, userDoc?.settings?.weeklyResetDay]);

  // ── Cross-window sync: listen for habit updates from Dashboard/Widget ──
  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    let unsubPromise: Promise<() => void> | null = null;

    async function setupListener() {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        if (!active) return () => {};
        const unlisten = await listen('widget-habit-updated', () => {
          if (!active) return;
          console.log('HabitsPage: Received widget-habit-updated, refreshing...');
          setRefreshKey(prev => prev + 1);
        });
        return unlisten;
      } catch (e) {
        console.error('HabitsPage: Failed to setup widget-habit-updated listener', e);
        return () => {};
      }
    }

    unsubPromise = setupListener();

    return () => {
      active = false;
      if (unsubPromise) {
        unsubPromise.then((unsub) => unsub()).catch(() => {});
      }
    };
  }, []);

  // ── Custom event listeners (from Layout keyboard shortcuts / CommandPalette) ──
  useEffect(() => {
    const handleOpenForm = () => setIsFormOpen(true);
    const handleSelectHabit = (e: Event) => {
      const habitId = (e as CustomEvent).detail;
      if (habitId) setSelectedHabitId(habitId);
    };

    window.addEventListener("w:open-habit-form", handleOpenForm);
    window.addEventListener("w:select-habit", handleSelectHabit);

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("action") === "new") {
      setIsFormOpen(true);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }

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
      const isComplete = isHabitCompletedInPeriod(h, today, weeklyResetDay, log, periodLogs, userDoc?.settings?.dailyResetTime);

      if (h.type === 'limiter') {
        l.push(h);
      } else if (isComplete) {
        c.push(h);
      } else if (
        isHabitResting(h, userDoc?.settings?.dailyResetTime) ||
        (h.startDate && h.startDate > today) ||
        !isHabitScheduledToday(h, today, weeklyResetDay)
      ) {
        up.push(h);
      } else {
        s.push(h);
      }
    });

    return { scheduled: s, upcoming: up, limiters: l, completed: c };
  }, [habits, log, today, userDoc, periodLogs]);

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
  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, habitId: string) => {
    if (e.key === ' ') {
      e.preventDefault();
      handleComplete(habitId);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setSelectedHabitId(habitId);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.habits-page .habit-card'));
      const currIdx = cards.indexOf(e.currentTarget);
      if (currIdx >= 0 && currIdx < cards.length - 1) {
        cards[currIdx + 1].focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.habits-page .habit-card'));
      const currIdx = cards.indexOf(e.currentTarget);
      if (currIdx > 0) {
        cards[currIdx - 1].focus();
      }
    }
  };

  const handleComplete = async (habitId: string) => {
    const originalLog = log ? JSON.parse(JSON.stringify(log)) : null;
    const originalHabits = habits ? [...habits] : [];
    const originalPeriodLogs = periodLogs ? [...periodLogs] : [];

    try {
      const habit = habits.find(h => h.id === habitId);
      const target = habit?.metric?.targetValue ?? 1;
      
      // Optimistic UI
      let updatedLog: HabitLog | null = null;
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
        
        updatedLog = {
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

        // Also update periodLogs optimistically
        setPeriodLogs(prevLogs => {
          const index = prevLogs.findIndex(l => l.date === today);
          if (index >= 0) {
            return prevLogs.map((l, i) => i === index ? updatedLog! : l);
          } else {
            return [...prevLogs, updatedLog!];
          }
        });

        return updatedLog;
      });

      const updates = await completeHabit(habitId, 1, target, "", userDoc?.settings?.dailyResetTime);
      if (updates) {
        setHabits(prev => prev.map(h => h.id === habitId ? { ...h, ...updates } : h));
      }

      // Notify other windows (Dashboard, Widget) about the change
      if (isTauri()) {
        import('@tauri-apps/api/event').then(({ emit }) => {
          emit('widget-habit-updated', { habitId, action: 'complete', source: 'habits' }).catch(() => {});
        });
      }
    } catch (e) {
      console.error(e);
      if (originalLog) setLog(originalLog);
      setHabits(originalHabits);
      setPeriodLogs(originalPeriodLogs);
      window.dispatchEvent(new CustomEvent("w:toast", { detail: "[ LOG COMPILATION FAILED ]" }));
    }
  };

  const handleUndo = async (habitId: string) => {
    const originalLog = log ? JSON.parse(JSON.stringify(log)) : null;
    const originalHabits = habits ? [...habits] : [];
    const originalPeriodLogs = periodLogs ? [...periodLogs] : [];

    try {
      let updatedLog: HabitLog | null = null;
      setLog(prev => {
        if (!prev) return prev;
        const newHabits = { ...prev.habits };
        const existing = newHabits[habitId];
        if (!existing || !existing.completions?.length) {
          delete newHabits[habitId];
          updatedLog = { ...prev, habits: newHabits };
          setPeriodLogs(prevLogs => {
            const index = prevLogs.findIndex(l => l.date === today);
            if (index >= 0) {
              return prevLogs.map((l, i) => i === index ? updatedLog! : l);
            }
            return prevLogs;
          });
          return updatedLog;
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
        updatedLog = { ...prev, habits: newHabits };
        
        setPeriodLogs(prevLogs => {
          const index = prevLogs.findIndex(l => l.date === today);
          if (index >= 0) {
            return prevLogs.map((l, i) => i === index ? updatedLog! : l);
          }
          return prevLogs;
        });

        return updatedLog;
      });

      const updates = await uncompleteHabit(habitId, userDoc?.settings?.dailyResetTime);
      if (updates) {
        setHabits(prev => prev.map(h => h.id === habitId ? { ...h, ...updates } : h));
      }

      // Notify other windows (Dashboard, Widget) about the change
      if (isTauri()) {
        import('@tauri-apps/api/event').then(({ emit }) => {
          emit('widget-habit-updated', { habitId, action: 'undo', source: 'habits' }).catch(() => {});
        });
      }
    } catch (e) {
      console.error(e);
      if (originalLog) setLog(originalLog);
      setHabits(originalHabits);
      setPeriodLogs(originalPeriodLogs);
      window.dispatchEvent(new CustomEvent("w:toast", { detail: "[ LOG COMPILATION FAILED ]" }));
    }
  };

  const handleCreateSubmit = async (data: any) => {
    try {
      let finalGroup = data.group;
      if (data.group && data.group.startsWith('new_') && data.newGroupName) {
        const sanitized = sanitizeGroupName(data.newGroupName);
        if (sanitized) {
          const lower = sanitized.toLowerCase();
          const existingGroup = groups.find(g => sanitizeGroupName(g.name).toLowerCase() === lower);
          if (existingGroup) {
            finalGroup = existingGroup.id;
          } else {
            const created = await createGroup(sanitized, groups.length);
            finalGroup = created.id;
            const fetchedGroups = await getGroups();
            setGroups(fetchedGroups);
          }
        }
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

      const createdHabit = await createHabit(newHabit as Omit<Habit, 'id' | 'uid'>);
      setHabits(prev => [...prev, createdHabit]);
      
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
      throw e;
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
            {layoutMode === 'custom' && (
              <div className="t-meta" style={{ padding: '12px 0 24px', opacity: 0.5 }}>
                 Custom drag-and-drop sort mode active. (Reordering handled by parent wrapper in full implementation)
              </div>
            )}
            {(layoutMode === 'default' || layoutMode === 'custom') && (
              <div className="habits-grid">
                {scheduled.map((h, index) => (
                  <HabitCard 
                    key={h.id} 
                    habit={h} 
                    isCompletedToday={false} 
                    doneToday={(() => {
                      const entry = log?.habits?.[h.id];
                      const interactedToday = (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;
                      if (h.type === 'limiter') return interactedToday;
                      const isMulti = h.period === "weekly" || h.period === "monthly" || h.period === "interval";
                      return h.type === "metric" && isMulti && interactedToday;
                    })()}
                    onComplete={() => handleComplete(h.id)} 
                    onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)}
                    currentValue={isMultiDayMetric(h) ? getTotalInRange(periodLogs, h.id, getPeriodStart(h, today, userDoc?.settings?.weeklyResetDay ?? 1)) : (log?.habits?.[h.id]?.value || 0)}
                    riskScore={riskScores[h.id]}
                    tabIndex={0}
                    onFocus={() => setFocusedIndex(index)}
                    onKeyDown={(e) => handleCardKeyDown(e, h.id)}
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
                         {groupHabits.map((h) => (
                           <HabitCard
                             key={h.id}
                             habit={h}
                             isCompletedToday={false}
                             doneToday={(() => {
                               const entry = log?.habits?.[h.id];
                               const interactedToday = (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;
                               if (h.type === 'limiter') return interactedToday;
                               const isMulti = h.period === "weekly" || h.period === "monthly" || h.period === "interval";
                               return h.type === "metric" && isMulti && interactedToday;
                             })()}
                             onComplete={() => handleComplete(h.id)}
                             onUndo={() => handleUndo(h.id)}
                             onClick={() => setSelectedHabitId(h.id)}
                             currentValue={isMultiDayMetric(h) ? getTotalInRange(periodLogs, h.id, getPeriodStart(h, today, userDoc?.settings?.weeklyResetDay ?? 1)) : (log?.habits?.[h.id]?.value || 0)}
                             riskScore={riskScores[h.id]}
                             tabIndex={0}
                             onFocus={() => setFocusedIndex(scheduled.indexOf(h))}
                             onKeyDown={(e) => handleCardKeyDown(e, h.id)}
                           />
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
                           {ungrouped.map((h) => (
                             <HabitCard
                              key={h.id}
                              habit={h}
                              isCompletedToday={false}
                              doneToday={(() => {
                               const entry = log?.habits?.[h.id];
                               const interactedToday = (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;
                               if (h.type === 'limiter') return interactedToday;
                               const isMulti = h.period === "weekly" || h.period === "monthly" || h.period === "interval";
                               return h.type === "metric" && isMulti && interactedToday;
                              })()}
                              onComplete={() => handleComplete(h.id)}
                              onUndo={() => handleUndo(h.id)}
                              onClick={() => setSelectedHabitId(h.id)}
                              currentValue={isMultiDayMetric(h) ? getTotalInRange(periodLogs, h.id, getPeriodStart(h, today, userDoc?.settings?.weeklyResetDay ?? 1)) : (log?.habits?.[h.id]?.value || 0)}
                              riskScore={riskScores[h.id]}
                              tabIndex={0}
                              onFocus={() => setFocusedIndex(scheduled.indexOf(h))}
                              onKeyDown={(e) => handleCardKeyDown(e, h.id)}
                            />
                           ))}
                        </div>
                      </HabitGroupHeader>
                   )
                })()}
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
                        tabIndex={0}
                        onKeyDown={(e) => handleCardKeyDown(e, h.id)}
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
                      doneToday={(() => {
                        const entry = log?.habits?.[h.id];
                        const interactedToday = (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;
                        if (h.type === 'limiter') return interactedToday;
                        const isMulti = h.period === "weekly" || h.period === "monthly" || h.period === "interval";
                        return h.type === "metric" && isMulti && interactedToday;
                      })()}
                      onComplete={() => handleComplete(h.id)} 
                      onUndo={() => handleUndo(h.id)} onClick={() => setSelectedHabitId(h.id)}
                      currentValue={isMultiDayMetric(h) ? getTotalInRange(periodLogs, h.id, getPeriodStart(h, today, userDoc?.settings?.weeklyResetDay ?? 1)) : (log?.habits?.[h.id]?.value || 0)}
                      tabIndex={0}
                      onKeyDown={(e) => handleCardKeyDown(e, h.id)}
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
                      currentValue={isMultiDayMetric(h) ? getTotalInRange(periodLogs, h.id, getPeriodStart(h, today, userDoc?.settings?.weeklyResetDay ?? 1)) : (log?.habits?.[h.id]?.value || 0)}
                      tabIndex={0}
                      onKeyDown={(e) => handleCardKeyDown(e, h.id)}
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
            <GroupManager onClose={() => { setIsGroupManagerOpen(false); setRefreshKey(prev => prev + 1); }} />
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
            const confirmed = await confirmDialog("PERMANENTLY PURGE HABIT?");
            if (confirmed) {
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

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStart(dateStr: string, weekStartDay: number): string {
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr;
  let safety = 0;
  while (d.getDay() !== weekStartDay && safety < 10) {
    d.setDate(d.getDate() - 1);
    safety++;
  }
  return formatDate(d);
}

function getMonthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

function getIntervalStart(habit: Habit, todayStr: string): string {
  if (habit.period !== "interval" || habit.intervalDays <= 0) return todayStr;
  const created = new Date(habit.createdAt);
  created.setHours(12, 0, 0, 0);
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

function isHabitCompletedInPeriod(
  habit: Habit,
  today: string,
  weeklyResetDay: number,
  log: HabitLog | null,
  periodLogs: HabitLog[],
  userResetTime?: string
): boolean {
  if (habit.period === "daily") {
    return !!log?.habits?.[habit.id]?.completed;
  }
  if (habit.period === "weekly") {
    if (habit.type === "standard") {
      if (!habit.lastCompletedDate) return false;
      const currentWeekStart = getWeekStart(today, weeklyResetDay);
      return habit.lastCompletedDate >= currentWeekStart;
    } else if (habit.type === "metric") {
      const target = habit.metric?.targetValue ?? 1;
      const start = getWeekStart(today, weeklyResetDay);
      const total = getTotalInRange(periodLogs, habit.id, start);
      return total >= target;
    }
  }
  if (habit.period === "monthly") {
    if (habit.type === "standard") {
      if (!habit.lastCompletedDate) return false;
      const currentMonthStart = getMonthStart(today);
      return habit.lastCompletedDate >= currentMonthStart;
    } else if (habit.type === "metric") {
      const target = habit.metric?.targetValue ?? 1;
      const start = getMonthStart(today);
      const total = getTotalInRange(periodLogs, habit.id, start);
      return total >= target;
    }
  }
  if (habit.period === "interval") {
    if (!!log?.habits?.[habit.id]?.completed) return true;
    return isHabitResting(habit, userResetTime);
  }
  return false;
}
