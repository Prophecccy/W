import { useState, useEffect, useCallback } from 'react';
import { db, collection, query, where, onSnapshot, doc, orderBy } from '../../../shared/config/firebase';
import { useAuthContext } from '../../auth/context';
import { Habit, HabitLog } from '../../habits/types';
import { User } from '../../../shared/types';
import { getToday, getWeekStart, getPeriodStart, isMultiDayMetric } from '../../../shared/utils/dateUtils';
import { completeHabit as completeHabitLog, uncompleteHabit as uncompleteHabitLog } from '../../habits/services/logService';
import { isHabitScheduledToday, isHabitResting } from '../../habits/utils/scheduleEngine';
import { isTauri } from '../../../shared/utils/tauri';
import { calculateGlobalStreak } from '../../habits/utils/streakEngine';

export interface WidgetData {
  habits: Habit[];
  today: string;
  todayLog: HabitLog | null;
  periodLogs: HabitLog[];
  userDoc: User | null;
  loading: boolean;
  scheduledHabits: Habit[];
  completedCount: number;
  totalScheduled: number;
  globalStreak: number;
  weeklyCompletions: number;
  scheduledLimiters: Habit[];
  completeHabit: (habitId: string, increment?: number) => Promise<void>;
  undoHabit: (habitId: string) => Promise<void>;
}

export function useWidgetData(): WidgetData {
  const { user } = useAuthContext();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [todayLog, setTodayLog] = useState<HabitLog | null>(null);
  const [periodLogs, setPeriodLogs] = useState<HabitLog[]>([]);
  const [userDoc, setUserDoc] = useState<User | null>(null);
  
  const [userLoading, setUserLoading] = useState(true);
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(true);

  const [today, setToday] = useState(() => {
    const cachedTime = typeof localStorage !== 'undefined' ? localStorage.getItem("w_daily_reset_time") || "04:00" : "04:00";
    return getToday(undefined, cachedTime);
  });

  // Update today state when userDoc loads or dailyResetTime changes, and poll for midnight/reset rollover
  useEffect(() => {
    const dailyResetTime = userDoc?.settings?.dailyResetTime;
    setToday(getToday(undefined, dailyResetTime));

    const interval = setInterval(() => {
      const freshToday = getToday(undefined, dailyResetTime);
      setToday((prev) => {
        if (prev !== freshToday) {
          console.log(`[Widget Date Rollover] Rolled over from ${prev} to ${freshToday}`);
          return freshToday;
        }
        return prev;
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [userDoc?.settings?.dailyResetTime]);

  // Listen to habits
  useEffect(() => {
    if (!user) return;

    const habitsRef = collection(db, 'users', user.uid, 'habits');
    const q = query(habitsRef, where('isActive', '==', true));

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Habit));
      data.sort((a: any, b: any) => a.order - b.order);
      const activeData = data.filter((h: any) => (!h.startDate || h.startDate <= today));
      setHabits(activeData);
      setHabitsLoading(false);
    }, (err) => {
      console.error("Habits listener error:", err);
      setHabitsLoading(false);
    });

    return unsub;
  }, [user, today]);

  // Listen to today's log
  useEffect(() => {
    if (!user) return;

    const logRef = doc(db, 'users', user.uid, 'logs', today);
    const unsub = onSnapshot(logRef, (snap) => {
      if (snap.exists()) {
        setTodayLog({ date: today, uid: user.uid, ...snap.data() } as HabitLog);
      } else {
        setTodayLog(null);
      }
      setLogLoading(false);
    }, (err) => {
      console.error("Log listener error:", err);
      setLogLoading(false);
    });

    return unsub;
  }, [user, today]);

  useEffect(() => {
    if (!user) return;

    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
    let minStart = getWeekStart(today, weeklyResetDay);
    for (const h of habits) {
      const start = getPeriodStart(h, today, weeklyResetDay);
      if (start < minStart) minStart = start;
    }

    const logsRef = collection(db, 'users', user.uid, 'logs');
    const q = query(
      logsRef,
      where('date', '>=', minStart),
      where('date', '<=', today),
      orderBy('date', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d: any) => d.data() as HabitLog);
      setPeriodLogs(data);
      setPeriodLoading(false);
    }, (err) => {
      console.error("Period logs listener error:", err);
      setPeriodLoading(false);
    });

    return unsub;
  }, [user, habits, today, userDoc?.settings?.weeklyResetDay, userDoc?.settings?.dailyResetTime]);

  // Listen to user doc (strikes, freeze, wallpapers)
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserDoc({ uid: snap.id, ...data } as User);
        if (typeof window !== "undefined" && data?.settings?.dailyResetTime) {
          localStorage.setItem("w_daily_reset_time", data.settings.dailyResetTime);
        }
      }
      setUserLoading(false);
    }, (err) => {
      console.error("User doc listener error:", err);
      setUserLoading(false);
    });

    return unsub;
  }, [user]);

  // Compute derived data
  const loading = userLoading || habitsLoading || logLoading || periodLoading;
  
  const scheduledHabits = habits.filter(h => {
    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
    return isHabitScheduledToday(h, today, weeklyResetDay) && 
      !isHabitResting(h, userDoc?.settings?.dailyResetTime) &&
      h.type !== 'limiter';
  });

  const scheduledLimiters = habits.filter(h => {
    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
    return isHabitScheduledToday(h, today, weeklyResetDay) && 
      !isHabitResting(h, userDoc?.settings?.dailyResetTime) &&
      h.type === 'limiter';
  });

  const completedCount = scheduledHabits.filter(h => {
    const entry = todayLog?.habits?.[h.id];
    if (isMultiDayMetric(h)) {
      return (entry?.completions?.length ?? 0) > 0 || (entry?.value ?? 0) > 0;
    }
    return entry?.completed === true;
  }).length;

  const totalScheduled = scheduledHabits.length;

  // Global streak
  const globalStreak = calculateGlobalStreak(habits, periodLogs, userDoc?.settings?.weeklyResetDay ?? 1, userDoc?.settings?.dailyResetTime);

  const weeklyCompletions = periodLogs.reduce((acc, log) => {
    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
    const currentWeekStart = getWeekStart(today, weeklyResetDay);
    if (log.date < currentWeekStart) return acc;

    const completionsInLog = Object.entries(log.habits || {})
      .filter(([habitId, entry]) => {
        const h = habits.find(x => x.id === habitId);
        if (h) return entry.completed && h.type !== 'limiter';
        return entry.completed; // Standard/metric completions are true; limiters are never true
      })
      .length;
    return acc + completionsInLog;
  }, 0);

  const completeHabit = useCallback(async (habitId: string) => {
    if (!user) return;
    if (userDoc?.freeze?.active) {
      console.warn("Widget is frozen. Habit completion is disabled.");
      return;
    }
    try {
      await completeHabitLog(habitId, 1, undefined, "", userDoc?.settings?.dailyResetTime);
      if (isTauri()) {
        const { emit } = await import('@tauri-apps/api/event');
        await emit('widget-habit-updated', { habitId, action: 'complete' });
      }
    } catch (e) {
      console.error('Widget: Failed to complete habit', e);
    }
  }, [user, userDoc]);

  const undoHabit = useCallback(async (habitId: string) => {
    if (!user) return;
    if (userDoc?.freeze?.active) {
      console.warn("Widget is frozen. Habit undo is disabled.");
      return;
    }
    try {
      await uncompleteHabitLog(habitId, userDoc?.settings?.dailyResetTime);
      if (isTauri()) {
        const { emit } = await import('@tauri-apps/api/event');
        await emit('widget-habit-updated', { habitId, action: 'undo' });
      }
    } catch (e) {
      console.error('Widget: Failed to undo habit', e);
    }
  }, [user, userDoc]);

  return {
    habits,
    today,
    todayLog,
    periodLogs,
    userDoc,
    loading,
    scheduledHabits,
    completedCount,
    totalScheduled,
    globalStreak,
    weeklyCompletions,
    scheduledLimiters,
    completeHabit,
    undoHabit,
  };
}
