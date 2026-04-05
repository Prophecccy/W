import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../../shared/config/firebase';
import { useAuthContext } from '../../auth/context';
import { Habit, HabitLog, HabitLogEntry } from '../../habits/types';
import { User } from '../../../shared/types';
import { getToday } from '../../../shared/utils/dateUtils';
import { completeHabit as completeHabitLog, uncompleteHabit as uncompleteHabitLog } from '../../habits/services/logService';
import { isHabitScheduledToday } from '../../habits/utils/scheduleEngine';

export interface WidgetData {
  habits: Habit[];
  todayLog: HabitLog | null;
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
  const [userDoc, setUserDoc] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const today = getToday();

  // Listen to habits
  useEffect(() => {
    if (!user) return;

    const habitsRef = collection(db, 'users', user.uid, 'habits');
    const q = query(habitsRef, where('isActive', '==', true));

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Habit));
      data.sort((a, b) => a.order - b.order);
      setHabits(data);
    });

    return unsub;
  }, [user]);

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

  // Listen to user doc (strikes, freeze, wallpapers)
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setUserDoc({ uid: snap.id, ...snap.data() } as User);
      }
      setLoading(false);
    });

    return unsub;
  }, [user]);

  // Compute derived data
  const scheduledHabits = habits.filter(h => isHabitScheduledToday(h, today));

  const completedCount = scheduledHabits.filter(h => {
    const entry = todayLog?.habits?.[h.id];
    return entry?.completed === true;
  }).length;

  const totalScheduled = scheduledHabits.length;

  // Global streak = longest current streak across all habits
  const globalStreak = habits.reduce((max, h) => Math.max(max, h.currentStreak), 0);

  // Weekly completions: count completed entries in today's log (rough proxy)
  const weeklyCompletions = todayLog
    ? Object.values(todayLog.habits || {}).filter((e: HabitLogEntry) => e.completed).length
    : 0;

  const completeHabit = useCallback(async (habitId: string) => {
    if (!user) return;
    try {
      await completeHabitLog(habitId);
    } catch (e) {
      console.error('Widget: Failed to complete habit', e);
    }
  }, [user]);

  const undoHabit = useCallback(async (habitId: string) => {
    if (!user) return;
    try {
      await uncompleteHabitLog(habitId);
    } catch (e) {
      console.error('Widget: Failed to undo habit', e);
    }
  }, [user]);

  return {
    habits,
    todayLog,
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
