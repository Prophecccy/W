import { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HabitCard } from "../../features/habits/components/HabitCard/HabitCard";
import { TodoCard } from "../../features/todos/components/TodoCard/TodoCard";
import { DailyNote } from "../../features/habits/components/DailyNote/DailyNote";
import { Habit, HabitLog, HabitGroup } from "../../features/habits/types";
import { Todo } from "../../features/todos/types";
import { getHabits, deleteHabit } from "../../features/habits/services/habitService";
import { getGroups } from "../../features/habits/services/groupService";
import { getTodayLog, getLogRange, completeHabit, uncompleteHabit } from "../../features/habits/services/logService";
import { getLocalNote } from "../../features/logs/services/localLogService";
import { getTodos, completeTodo, deleteTodo } from "../../features/todos/services/todoService";
import { isHabitScheduledToday, isHabitResting } from "../../features/habits/utils/scheduleEngine";
import { HabitDetail } from "../../features/habits/components/HabitDetail/HabitDetail";
import { getToday } from "../../shared/utils/dateUtils";
import { User } from "../../shared/types";
import { useTimeLeft } from "../../features/dashboard/hooks/useTimeLeft";
import { isTauri, confirmDialog } from "../../shared/utils/tauri";
import { playMechanicalClick, playSubtleThud } from "../../shared/services/tactileAudioService";
import { SPRING_LAYOUT } from "../../shared/constants/motion";
import "./MobileDashboard.css";

interface MobileDashboardProps {
  userDoc: User;
  gapResult?: any;
}

export function MobileDashboard({ userDoc }: MobileDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [log, setLog] = useState<HabitLog | null>(null);
  const [periodLogs, setPeriodLogs] = useState<HabitLog[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [groups, setGroups] = useState<HabitGroup[]>([]);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [mobileTab, setMobileTab] = useState<"all" | "habits" | "limiters" | "todos">("all");

  const [today, setToday] = useState(() => getToday(undefined, userDoc?.settings?.dailyResetTime));

  const timeLeft = useTimeLeft(
    userDoc?.settings?.wakeUpTime || "07:00",
    userDoc?.settings?.bedTime || "23:00"
  );

  useEffect(() => {
    const dailyResetTime = userDoc?.settings?.dailyResetTime;
    setToday(getToday(undefined, dailyResetTime));

    const interval = setInterval(() => {
      const freshToday = getToday(undefined, dailyResetTime);
      setToday((prev) => (prev !== freshToday ? freshToday : prev));
    }, 10000);

    return () => clearInterval(interval);
  }, [userDoc?.settings?.dailyResetTime]);

  useEffect(() => {
    let active = true;
    let unsubPromise: Promise<(() => void)[]> | null = null;

    const handleDataSynced = () => {
      setRefreshTrigger((prev) => prev + 1);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("w:data-synced", handleDataSynced);
    }

    async function setupListeners() {
      if (!isTauri()) return [];
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (!active) return [];

        const unHabit = await listen("widget-habit-updated", () => {
          setRefreshTrigger((prev) => prev + 1);
        });
        const unTodo = await listen("widget-todo-updated", () => {
          setRefreshTrigger((prev) => prev + 1);
        });
        const unSynced = await listen("w_data_synced", () => {
          if (active) setRefreshTrigger((prev) => prev + 1);
        });
        const unLocalDb = await listen("w_localdb_write", () => {
          if (active) setRefreshTrigger((prev) => prev + 1);
        });

        return [unHabit, unTodo, unSynced, unLocalDb];
      } catch (e) {
        console.error("Failed to setup listeners in MobileDashboard", e);
        return [];
      }
    }

    unsubPromise = setupListeners();

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("w:data-synced", handleDataSynced);
      }
      if (unsubPromise) {
        unsubPromise.then((unsubs) => unsubs.forEach((unsub) => unsub())).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const [fetchedHabits, fetchedLog, fetchedTodos, fetchedGroups, localNote] = await Promise.all([
          getHabits(),
          getTodayLog(userDoc?.settings?.dailyResetTime),
          getTodos(),
          getGroups(),
          getLocalNote(today),
        ]);
        if (!active) return;
        fetchedLog.notes = localNote;

        const activeHabits = fetchedHabits.filter((h) => !h.startDate || h.startDate <= today);
        setHabits(activeHabits);
        setGroups(fetchedGroups);
        setLog(fetchedLog);
        setTodos(fetchedTodos);

        const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
        const scheduled = activeHabits.filter((h) => isHabitScheduledToday(h, today, weeklyResetDay));
        let minStart = today;
        for (const h of scheduled) {
          if (!isMultiDayMetric(h)) continue;
          const start = getPeriodStart(h, today, weeklyResetDay);
          if (start < minStart) minStart = start;
        }

        if (scheduled.some(isMultiDayMetric)) {
          const logs = await getLogRange(minStart, today);
          if (!active) return;
          setPeriodLogs(logs);
        } else {
          if (!active) return;
          setPeriodLogs([]);
        }
      } catch (e) {
        console.error("MobileDashboard Load Error", e);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, [today, userDoc?.settings?.weeklyResetDay, refreshTrigger]);

  // Derived habits
  const scheduledHabits = useMemo(() => {
    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
    return habits
      .filter((h) => {
        if (isHabitResting(h, userDoc?.settings?.dailyResetTime)) return false;
        if (isMultiDayMetric(h) && h.metric) {
          const target = h.metric.targetValue;
          const start = getPeriodStart(h, today, weeklyResetDay);
          const total = getTotalInRange(periodLogs, h.id, start);
          if (target > 0 && total >= target) return false;
        }
        const isComplete = !!log?.habits?.[h.id]?.completed;
        if (isComplete) return false;
        return isHabitScheduledToday(h, today, weeklyResetDay) && h.type !== "limiter";
      })
      .sort((a, b) => {
        const aEntry = log?.habits?.[a.id];
        const bEntry = log?.habits?.[b.id];
        const aDoneToday = (aEntry?.completions?.length ?? 0) > 0 || (aEntry?.value ?? 0) > 0;
        const bDoneToday = (bEntry?.completions?.length ?? 0) > 0 || (bEntry?.value ?? 0) > 0;
        return Number(aDoneToday) - Number(bDoneToday);
      });
  }, [habits, log, today, periodLogs, userDoc?.settings?.weeklyResetDay]);

  // Derived limiters
  const scheduledLimiters = useMemo(() => {
    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
    return habits
      .filter((h) => {
        if (h.type !== "limiter") return false;
        if (isHabitResting(h, userDoc?.settings?.dailyResetTime)) return false;
        return isHabitScheduledToday(h, today, weeklyResetDay);
      })
      .sort((a, b) => {
        const aEntry = log?.habits?.[a.id];
        const bEntry = log?.habits?.[b.id];
        const aDoneToday = (aEntry?.completions?.length ?? 0) > 0 || (aEntry?.value ?? 0) > 0;
        const bDoneToday = (bEntry?.completions?.length ?? 0) > 0 || (bEntry?.value ?? 0) > 0;
        return Number(aDoneToday) - Number(bDoneToday);
      });
  }, [habits, log, today, userDoc?.settings?.weeklyResetDay]);

  // Derived todos
  const currentTodos = useMemo(() => {
    return todos.filter((t) => {
      const isFuture = t.future && t.future > today;
      const isExpiredAndDisappeared = t.postDeadlineAction === "disappear" && t.deadline && t.deadline < today;
      return !isFuture && !isExpiredAndDisappeared;
    });
  }, [todos, today]);

  // Derived metrics
  const totalScheduledHabits = useMemo(() => {
    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
    return habits.filter((h) => {
      if (isHabitResting(h, userDoc?.settings?.dailyResetTime)) return false;
      return isHabitScheduledToday(h, today, weeklyResetDay) && h.type !== "limiter";
    }).length;
  }, [habits, today, userDoc?.settings?.weeklyResetDay, userDoc?.settings?.dailyResetTime]);

  const completedHabitsCount = useMemo(() => {
    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
    return habits.filter((h) => {
      if (isHabitResting(h, userDoc?.settings?.dailyResetTime)) return false;
      if (!isHabitScheduledToday(h, today, weeklyResetDay) || h.type === "limiter") return false;
      if (isMultiDayMetric(h) && h.metric) {
        const target = h.metric.targetValue;
        const start = getPeriodStart(h, today, weeklyResetDay);
        const total = getTotalInRange(periodLogs, h.id, start);
        return target > 0 && total >= target;
      }
      return !!log?.habits?.[h.id]?.completed;
    }).length;
  }, [habits, log, today, periodLogs, userDoc?.settings?.weeklyResetDay, userDoc?.settings?.dailyResetTime]);

  const progressPercentage = totalScheduledHabits > 0
    ? Math.round((completedHabitsCount / totalScheduledHabits) * 100)
    : 0;

  const currentStrikes = userDoc?.strikes?.current ?? 0;

  if (loading) {
    return (
      <div className="mobile-dashboard-loading">
        <span className="t-label">[ CALIBRATING MOBILE HUD... ]</span>
      </div>
    );
  }

  return (
    <div className="mobile-dashboard">
      {/* ─── 1. Mobile Horizontal Fuel Strip ─── */}
      <div className="mobile-dashboard__fuel-card">
        <div className="mobile-dashboard__fuel-header">
          <span className="mobile-dashboard__fuel-title t-label">[ WAKING FUEL ]</span>
          <span className={`mobile-dashboard__fuel-badge ${timeLeft.phase === "sleeping" ? "badge--sleep" : ""}`}>
            {timeLeft.phase === "sleeping" ? "[ RECOVERY ]" : `${Math.round(timeLeft.percent)}% OPERATIONAL`}
          </span>
        </div>
        <div className="mobile-dashboard__fuel-track">
          <div
            className={`mobile-dashboard__fuel-bar ${timeLeft.percent <= 15 ? "bar--critical" : ""}`}
            style={{ width: `${Math.max(0, Math.min(100, timeLeft.percent))}%` }}
          />
        </div>
      </div>

      {/* ─── 2. Tactical Telemetry Metrics Deck ─── */}
      <div className="mobile-dashboard__stats-deck">
        <div className="mobile-stats-cell">
          <span className="mobile-stats-cell__label t-label">DONE</span>
          <span className="mobile-stats-cell__value t-data">{completedHabitsCount}</span>
        </div>
        <div className="mobile-stats-divider" />
        <div className="mobile-stats-cell">
          <span className="mobile-stats-cell__label t-label">PENDING</span>
          <span className="mobile-stats-cell__value t-data">{scheduledHabits.length}</span>
        </div>
        <div className="mobile-stats-divider" />
        <div className="mobile-stats-cell">
          <span className="mobile-stats-cell__label t-label">STRIKES</span>
          <span className={`mobile-stats-cell__value t-data ${currentStrikes >= 3 ? "text-warning" : ""}`}>
            {currentStrikes}/5
          </span>
        </div>
        <div className="mobile-stats-divider" />
        <div className="mobile-stats-cell">
          <span className="mobile-stats-cell__label t-label">PROGRESS</span>
          <span className="mobile-stats-cell__value t-data">{progressPercentage}%</span>
        </div>
      </div>

      {/* ─── 3. Tactical Segment Filter Tabs ─── */}
      <div className="mobile-dashboard__tabs" role="tablist">
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "all" ? "mobile-tab-btn--active" : ""}`}
          onClick={() => {
            playMechanicalClick();
            setMobileTab("all");
          }}
        >
          [ ALL ]
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "habits" ? "mobile-tab-btn--active" : ""}`}
          onClick={() => {
            playMechanicalClick();
            setMobileTab("habits");
          }}
        >
          [ HABITS ({scheduledHabits.length}) ]
        </button>
        {scheduledLimiters.length > 0 && (
          <button
            type="button"
            className={`mobile-tab-btn ${mobileTab === "limiters" ? "mobile-tab-btn--active" : ""}`}
            onClick={() => {
              playMechanicalClick();
              setMobileTab("limiters");
            }}
          >
            [ LIMITERS ({scheduledLimiters.length}) ]
          </button>
        )}
        <button
          type="button"
          className={`mobile-tab-btn ${mobileTab === "todos" ? "mobile-tab-btn--active" : ""}`}
          onClick={() => {
            playMechanicalClick();
            setMobileTab("todos");
          }}
        >
          [ TODOS ({currentTodos.length}) ]
        </button>
      </div>

      {/* ─── 4. Stream of Active Directives ─── */}
      <div className="mobile-dashboard__stream">
        {/* HABITS SECTION */}
        {(mobileTab === "all" || mobileTab === "habits") && (
          <section className="mobile-section">
            <div className="mobile-section__header">
              <span className="t-label">[ ACTIVE PROTOCOLS ]</span>
              <span className="t-meta">{scheduledHabits.length} REMAINING</span>
            </div>
            {scheduledHabits.length === 0 ? (
              <div className="mobile-empty-card">
                <span className="t-meta">[ ALL HABIT PROTOCOLS EXECUTED FOR TODAY ]</span>
              </div>
            ) : (
              <div className="mobile-cards-stack">
                <AnimatePresence mode="popLayout" initial={false}>
                  {scheduledHabits.map((h) => {
                    const hEntry = log?.habits?.[h.id];
                    const isDoneToday = (hEntry?.completions?.length ?? 0) > 0 || (hEntry?.value ?? 0) > 0;
                    return (
                      <motion.div key={h.id} layout transition={SPRING_LAYOUT}>
                        <HabitCard
                          habit={h}
                          isCompletedToday={false}
                          doneToday={isDoneToday}
                          currentValue={hEntry?.value ?? 0}
                          onComplete={() => {
                            const val = h.metric ? (hEntry?.value ?? 0) + 1 : 1;
                            const target = h.metric?.targetValue ?? 1;
                            completeHabit(h.id, val, target, "", userDoc?.settings?.dailyResetTime);
                            setRefreshTrigger((prev) => prev + 1);
                          }}
                          onUndo={() => {
                            uncompleteHabit(h.id, userDoc?.settings?.dailyResetTime);
                            setRefreshTrigger((prev) => prev + 1);
                          }}
                          onClick={() => {
                            playSubtleThud();
                            setSelectedHabitId(h.id);
                          }}
                          userResetTime={userDoc?.settings?.dailyResetTime}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </section>
        )}

        {/* LIMITERS SECTION */}
        {(mobileTab === "all" || mobileTab === "limiters") && scheduledLimiters.length > 0 && (
          <section className="mobile-section">
            <div className="mobile-section__header">
              <span className="t-label">[ ACTIVE LIMITERS ]</span>
              <span className="t-meta">{scheduledLimiters.length} ACTIVE</span>
            </div>
            <div className="mobile-cards-stack">
              <AnimatePresence mode="popLayout" initial={false}>
                {scheduledLimiters.map((h) => {
                  const hEntry = log?.habits?.[h.id];
                  const isDoneToday = (hEntry?.completions?.length ?? 0) > 0 || (hEntry?.value ?? 0) > 0;
                  return (
                    <motion.div key={h.id} layout transition={SPRING_LAYOUT}>
                      <HabitCard
                        habit={h}
                        isCompletedToday={false}
                        doneToday={isDoneToday}
                        currentValue={hEntry?.value ?? 0}
                        onComplete={() => {
                          const val = (hEntry?.value ?? 0) + 1;
                          const target = h.metric?.targetValue ?? 1;
                          completeHabit(h.id, val, target, "", userDoc?.settings?.dailyResetTime);
                          setRefreshTrigger((prev) => prev + 1);
                        }}
                        onUndo={() => {
                          uncompleteHabit(h.id, userDoc?.settings?.dailyResetTime);
                          setRefreshTrigger((prev) => prev + 1);
                        }}
                        onClick={() => {
                          playSubtleThud();
                          setSelectedHabitId(h.id);
                        }}
                        userResetTime={userDoc?.settings?.dailyResetTime}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* TODOS SECTION */}
        {(mobileTab === "all" || mobileTab === "todos") && (
          <section className="mobile-section">
            <div className="mobile-section__header">
              <span className="t-label">[ DIRECTIVES ]</span>
              <span className="t-meta">{currentTodos.length} QUEUED</span>
            </div>
            {currentTodos.length === 0 ? (
              <div className="mobile-empty-card">
                <span className="t-meta">[ QUEUE CLEAR — ZERO PENDING DIRECTIVES ]</span>
              </div>
            ) : (
              <div className="mobile-cards-stack">
                <AnimatePresence mode="popLayout" initial={false}>
                  {currentTodos.map((t) => (
                    <motion.div key={t.id} layout transition={SPRING_LAYOUT}>
                      <TodoCard
                        todo={t}
                        onComplete={() => {
                          completeTodo(t.id);
                          setTodos((prev) => prev.filter((item) => item.id !== t.id));
                        }}
                        onClick={() => playMechanicalClick()}
                        onDelete={() => {
                          deleteTodo(t.id);
                          setTodos((prev) => prev.filter((item) => item.id !== t.id));
                        }}
                        dailyResetTime={userDoc?.settings?.dailyResetTime}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        )}

        {/* DAILY LOGBOOK NOTE */}
        <section className="mobile-section mobile-section--note">
          <DailyNote initialNote={log?.notes ?? ""} dailyResetTime={userDoc?.settings?.dailyResetTime} date={today} />
        </section>
      </div>

      {/* ─── Detail Modal / Sheet ─── */}
      <AnimatePresence>
        {selectedHabitId && habits.find((h) => h.id === selectedHabitId) && (
          <HabitDetail
            habit={habits.find((h) => h.id === selectedHabitId)!}
            onClose={() => setSelectedHabitId(null)}
            userResetTime={userDoc?.settings?.dailyResetTime}
            groups={groups}
            onGroupCreated={(newG) => setGroups((prev) => [...prev, newG])}
            onUpdate={(updated) => {
              if (updated.isArchived) {
                setHabits((prev) => prev.filter((h) => h.id !== updated.id));
              } else {
                setHabits((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
              }
              setRefreshTrigger((prev) => prev + 1);
            }}
            onDeleteRequest={async (habit) => {
              const confirmed = await confirmDialog("PERMANENTLY PURGE HABIT?");
              if (confirmed) {
                try {
                  await deleteHabit(habit.id);
                  setHabits((prev) => prev.filter((h) => h.id !== habit.id));
                  setSelectedHabitId(null);
                  setRefreshTrigger((prev) => prev + 1);
                } catch (e) {
                  console.error("Failed to delete habit", e);
                }
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
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
  return (
    (habit.type === "metric" || habit.type === "limiter") &&
    (habit.period === "weekly" || habit.period === "monthly" || habit.period === "interval")
  );
}

function getTotalInRange(logs: HabitLog[], habitId: string, startDate: string): number {
  let total = 0;
  for (const log of logs) {
    if (log.date < startDate) continue;
    total += log.habits?.[habitId]?.value ?? 0;
  }
  return total;
}
