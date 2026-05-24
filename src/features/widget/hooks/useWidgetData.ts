import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot, doc, orderBy } from 'firebase/firestore';
import { db } from '../../../shared/config/firebase';
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

  const today = getToday(undefined, userDoc?.settings?.dailyResetTime);

  // Listen to habits
  useEffect(() => {
    if (!user) return;

    const habitsRef = collection(db, 'users', user.uid, 'habits');
    const q = query(habitsRef, where('isActive', '==', true));

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Habit));
      data.sort((a, b) => a.order - b.order);
      const activeData = data.filter(h => (!h.startDate || h.startDate <= today) && h.type !== 'limiter');
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
    const scheduled = habits.filter(h => isHabitScheduledToday(h, today, weeklyResetDay) && !isHabitResting(h, userDoc?.settings?.dailyResetTime));
    const multiDayMetric = scheduled.filter(isMultiDayMetric);

    let minStart = today;
    for (const h of multiDayMetric) {
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
      const data = snap.docs.map((d) => d.data() as HabitLog);
      setPeriodLogs(data);
    });

    return unsub;
  }, [user, habits, today, userDoc?.settings?.weeklyResetDay]);

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
      !isHabitResting(h, userDoc?.settings?.dailyResetTime);
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

  // Weekly completions: count completed entries in today's log (excluding limiters)
  const weeklyCompletions = todayLog
    ? Object.entries(todayLog.habits || {})
        .filter(([habitId, entry]) => entry.completed && habits.some(h => h.id === habitId))
        .length
    : 0;

  const completeHabit = useCallback(async (habitId: string) => {
    if (!user) return;
    try {
      await completeHabitLog(habitId);
      if (isTauri()) {
        const { emit } = await import('@tauri-apps/api/event');
        await emit('widget-habit-updated', { habitId, action: 'complete' });
      }
    } catch (e) {
      console.error('Widget: Failed to complete habit', e);
    }
  }, [user]);

  const undoHabit = useCallback(async (habitId: string) => {
    if (!user) return;
    try {
      await uncompleteHabitLog(habitId);
      if (isTauri()) {
        const { emit } = await import('@tauri-apps/api/event');
        await emit('widget-habit-updated', { habitId, action: 'undo' });
      }
    } catch (e) {
      console.error('Widget: Failed to undo habit', e);
    }
  }, [user]);

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
  while (d.getDay() !== weekStartDay) {
    d.setDate(d.getDate() - 1);
  }
  return formatDate(d);
}

function getMonthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

function isMultiDayMetric(habit: Habit): boolean {
  return habit.type === "metric" && (habit.period === "weekly" || habit.period === "monthly" || habit.period === "interval");
}

function getIntervalStart(habit: Habit, todayStr: string): string {
  if (habit.period !== "interval" || habit.intervalDays <= 0) return todayStr;
  const created = new Date(habit.createdAt);
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
