import { useState, useEffect, useCallback } from 'react';
import { db, collection, query, where, onSnapshot, doc, orderBy } from '../../../shared/config/firebase';
import { useAuthContext } from '../../auth/context';
import { Habit, HabitLog } from '../../habits/types';
import { User } from '../../../shared/types';
import { getToday } from '../../../shared/utils/dateUtils';
import { completeHabit as completeHabitLog, uncompleteHabit as uncompleteHabitLog } from '../../habits/services/logService';
import { isHabitScheduledToday, isHabitResting } from '../../habits/utils/scheduleEngine';
import { isTauri } from '../../../shared/utils/tauri';

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
  completeHabit: (habitId: string) => Promise<void>;
  undoHabit: (habitId: string) => Promise<void>;
}

export function useWidgetData(): WidgetData {
  const { user } = useAuthContext();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [todayLog, setTodayLog] = useState<HabitLog | null>(null);
  const [periodLogs, setPeriodLogs] = useState<HabitLog[]>([]);
  const [userDoc, setUserDoc] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [today, setToday] = useState(() => getToday(undefined, userDoc?.settings?.dailyResetTime));

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
      setLoading(false);
    });

    return unsub;
  }, [user]);

  // Compute derived data
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

  // Global streak = longest current streak across all habits
  const globalStreak = habits.reduce((max, h) => Math.max(max, h.currentStreak), 0);

  const weeklyCompletions = periodLogs.reduce((acc, log) => {
    const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;
    const currentWeekStart = getWeekStart(today, weeklyResetDay);
    if (log.date < currentWeekStart) return acc;

    const completionsInLog = Object.entries(log.habits || {})
      .filter(([habitId, entry]) => {
        const h = habits.find(x => x.id === habitId);
        return entry.completed && h && h.type !== 'limiter';
      })
      .length;
    return acc + completionsInLog;
  }, 0);

  const completeHabit = useCallback(async (habitId: string) => {
    if (!user) return;
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

function isMultiDayMetric(habit: Habit): boolean {
  return (habit.type === "metric" || habit.type === "limiter") && (habit.period === "weekly" || habit.period === "monthly" || habit.period === "interval");
}

function getIntervalStart(habit: Habit, todayStr: string): string {
  if (habit.period !== "interval" || habit.intervalDays <= 0) return todayStr;
  const created = new Date(habit.createdAt);
  created.setHours(12, 0, 0, 0); // Normalize to noon to match today comparison
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
