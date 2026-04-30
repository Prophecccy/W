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

      const { formatDate } = await import('../../../shared/utils/dateUtils');
      const d = (dt: Date) => formatDate(dt);

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
    
    // Best streak card (always works if habits exist)
    const sortedByStreak = [...habits].sort((a,b) => b.currentStreak - a.currentStreak);
    const topStreak = sortedByStreak[0];

    return [
      {
        id: "consistency",
        title: "MOST CONSISTENT",
        value: monthSummary.mostConsistent?.title || (habits.length > 0 ? "Complete a habit!" : "Add a habit first"),
        subValue: monthSummary.mostConsistent 
          ? 'Top performer'
          : "Needs completions",
        icon: "Crown",
        color: monthSummary.mostConsistent?.color || 'var(--accent)'
      },
      {
        id: "improved",
        title: "MOST IMPROVED",
        value: monthSummary.mostImproved?.title || "More data needed",
        subValue: monthSummary.mostImproved ? "Trending up this period" : "Track for a few days",
        icon: "TrendingUp",
        color: monthSummary.mostImproved?.color
      },
      {
        id: "best-day",
        title: "BEST DAY",
        value: weekSummary.bestDay 
          ? new Date(weekSummary.bestDay.date + "T00:00:00").toLocaleDateString('en-US', { weekday: 'long' }) 
          : "No activity yet",
        subValue: weekSummary.bestDay 
          ? `${weekSummary.bestDay.completionRate}% completion` 
          : "Complete habits to see trends",
        icon: "CalendarCheck"
      },
      {
        id: "streak",
        title: "HIGHEST STREAK",
        value: topStreak ? topStreak.title : "No habits yet",
        subValue: topStreak ? `${topStreak.currentStreak} day${topStreak.currentStreak !== 1 ? 's' : ''} active` : "Create your first habit",
        icon: "Flame",
        color: topStreak?.color
      }
    ];
  }, [monthSummary, weekSummary, habits]);

  // Only show skeletons while genuinely loading, not when data is empty
  const displayInsights = loading
    ? Array(4).fill({ id: 'skel', title: '', value: '', subValue: '', icon: '', color: '' }) as InsightCard[]
    : insights;

  return (
    <div className="analytics-page">
      <header className="analytics-header">
        <h1 className="t-display">[ ANALYTICS ]</h1>
        <p className="t-meta" style={{ opacity: 0.5, marginTop: '8px' }}>
          {loading ? 'CALCULATING TRENDS...' : 'DATA REFRESHED'}
        </p>
      </header>

      <section className="smart-insights-row">
        {displayInsights.map((i, idx) => (
          <SmartInsightCard key={i.id === 'skel' ? `skel-${idx}` : i.id} insight={i} />
        ))}
      </section>

      {loading ? (
        <div className="analytics-placeholder">
          <div className="sic-shimmer" style={{ height: '300px', borderRadius: '8px', opacity: 0.1 }} />
        </div>
      ) : (
        <div className="analytics-grid">
          <div className="analytics-card heatmap-card">
            <ActivityHeatmap />
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
          
          <div className="analytics-card rate-card">
            <h2 className="t-label">[ MASTER SCORE ]</h2>
            <ConsistencyScore rate={monthSummary?.completionRate || 0} size={100} />
          </div>
        </div>
      )}
      
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
