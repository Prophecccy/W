import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../auth/hooks/useAuth";
import { getHabits } from "../../habits/services/habitService";
import { generateMonthlySummary, generateWeeklySummary } from "../services/analyticsService";
import { Habit } from "../../habits/types";
import { MonthlySummary, WeeklySummary, InsightCard } from "../types";
import { getToday } from "../../../shared/utils/dateUtils";
import { SmartInsightCard } from "./SmartInsightCard";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { ChartWeeklyComparison } from "./Charts/ChartWeeklyComparison";
import { ChartMonthlyComparison } from "./Charts/ChartMonthlyComparison";
import { TimelineReview } from "./TimelineReview";
import { HabitDeepDive } from "./HabitDeepDive";
import { ConsistencyScore } from "./ConsistencyScore";
import "./AnalyticsPage.css";

export const AnalyticsPage: React.FC = () => {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [monthSummary, setMonthSummary] = useState<MonthlySummary | null>(null);
  const [weekSummary, setWeekSummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);

  // For deep dive
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);

      // In a real scenario we'd click a habit somewhere to set this. For now we just mock an array list at bottom to click.

  useEffect(() => {
    async function load() {
      if (!user) return;
      setLoading(true);

      const h = await getHabits();
      setHabits(h);

      const today = new Date(getToday() + "T00:00:00");
      
      // Calculate start dates
      const weekEnd = new Date(today);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);

      const pWeekEnd = new Date(weekStart);
      pWeekEnd.setDate(pWeekEnd.getDate() - 1);
      const pWeekStart = new Date(pWeekEnd);
      pWeekStart.setDate(pWeekStart.getDate() - 6);

      // Month
      const monthEnd = new Date(today);
      const monthStart = new Date(monthEnd);
      monthStart.setDate(monthStart.getDate() - 29);

      const pMonthEnd = new Date(monthStart);
      pMonthEnd.setDate(pMonthEnd.getDate() - 1);
      const pMonthStart = new Date(pMonthEnd);
      pMonthStart.setDate(pMonthStart.getDate() - 29);

      // Format util
      const d = (dt: Date) => dt.toISOString().split("T")[0];

      const [wSum, mSum] = await Promise.all([
        generateWeeklySummary(d(weekStart), d(weekEnd), d(pWeekStart), d(pWeekEnd)),
        generateMonthlySummary(d(monthStart), d(monthEnd), d(pMonthStart), d(pMonthEnd), h)
      ]);

      setWeekSummary(wSum);
      setMonthSummary(mSum);
      setLoading(false);
    }
    load();
  }, [user]);

  const insights: InsightCard[] = useMemo(() => {
    if (!monthSummary || !weekSummary) return [];
    
    return [
      {
        id: "consistency",
        title: "MOST CONSISTENT",
        value: monthSummary.mostConsistent?.title || "N/A",
        subValue: monthSummary.mostConsistent?.metric ? "Metric" : "Daily",
        icon: "Crown",
        color: monthSummary.mostConsistent?.color
      },
      {
        id: "improved",
        title: "MOST IMPROVED",
        value: monthSummary.mostImproved?.title || "N/A",
        subValue: "+20% this month", // mock subvalue
        icon: "TrendingUp",
      },
      {
        id: "best-day",
        title: "BEST DAY",
        value: weekSummary.bestDay ? new Date(weekSummary.bestDay.date).toLocaleDateString('en-US', { weekday: 'long' }) : "N/A",
        subValue: "Highest completion",
        icon: "CalendarCheck"
      },
      {
        id: "streak",
        title: "HIGHEST STREAK",
        value: habits.sort((a,b) => b.currentStreak - a.currentStreak)[0]?.title || "N/A",
        subValue: `${habits.sort((a,b) => b.currentStreak - a.currentStreak)[0]?.currentStreak || 0} days`,
        icon: "Flame"
      }
    ];
  }, [monthSummary, weekSummary, habits]);

  if (loading) return <div className="analytics-page loading">Loading Analytics...</div>;

  return (
    <div className="analytics-page">
      <header className="analytics-header">
        <h1 className="t-display">[ ANALYTICS ]</h1>
      </header>

      <section className="smart-insights-row">
        {insights.map(i => (
          <SmartInsightCard key={i.id} insight={i} />
        ))}
      </section>

      <div className="analytics-grid">
        <div className="analytics-card heatmap-card">
          <h2 className="t-label">[ ACTIVITY HEATMAP ]</h2>
          <ActivityHeatmap endDate={getToday()} daysCount={90} />
        </div>

        <div className="analytics-card rate-card">
          <h2 className="t-label">[ MONTHLY COMPLETION ]</h2>
          <div className="rate-content">
            <span className="t-display">{monthSummary?.completionRate || 0}%</span>
            <div className={`trend ${(monthSummary?.completionRate || 0) >= (monthSummary?.previousMonthCompletionRate || 0) ? 'up' : 'down'}`}>
              {(monthSummary?.completionRate || 0) >= (monthSummary?.previousMonthCompletionRate || 0) ? "↗" : "↘"} 
              {Math.abs((monthSummary?.completionRate || 0) - (monthSummary?.previousMonthCompletionRate || 0))}% vs last
            </div>
          </div>
        </div>

        <div className="analytics-card chart-card">
          <h2 className="t-label">[ WEEKLY COMPARISON ]</h2>
          <ChartWeeklyComparison currentWeek={weekSummary} />
        </div>

        <div className="analytics-card chart-card">
          <h2 className="t-label">[ MONTHLY TREND ]</h2>
          <ChartMonthlyComparison currentMonth={monthSummary} />
        </div>
        
        {/* Mocking a place to show consistency temporarily */}
        <div className="analytics-card rate-card">
          <h2 className="t-label">[ MASTER SCORE ]</h2>
          <ConsistencyScore rate={monthSummary?.completionRate || 0} size={100} />
        </div>
      </div>
      
      <TimelineReview />
      
      <div className="analytics-card">
        <h2 className="t-label">[ HABITS LIST (Click for Deep Dive) ]</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          {habits.map(h => (
            <button key={h.id} onClick={() => setSelectedHabitId(h.id)} 
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', padding: '0.5rem 1rem', borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer' }}>
              {h.title}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedHabitId && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 100 }}
          >
            <HabitDeepDive 
              habit={habits.find(h => h.id === selectedHabitId)!} 
              onClose={() => setSelectedHabitId(null)} 
            />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
