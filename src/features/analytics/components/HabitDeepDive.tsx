import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Habit } from "../../habits/types";
import { HabitAnalytics } from "../types";
import { generateHabitAnalytics } from "../services/analyticsService";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { getLogRange } from "../../habits/services/logService";
import { getToday, formatDate } from "../../../shared/utils/dateUtils";
import { useUserStore } from "../../../shared/stores/userStore";
import { motion } from "framer-motion";
import "./HabitDeepDive.css";

interface Props {
  habit: Habit;
  onClose: () => void;
}

export const HabitDeepDive: React.FC<Props> = ({ habit, onClose }) => {
  const [stats, setStats] = useState<HabitAnalytics | null>(null);
  const { userDoc } = useUserStore();
  const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;

  useEffect(() => {
    async function load() {
      const endDate = getToday();
      
      // Load logs from the habit's creation date (or startDate), or at least the last 90 days
      const creationDate = new Date(habit.createdAt);
      const habitStartDate = habit.startDate ? new Date(habit.startDate + "T00:00:00") : creationDate;
      const earliestHabitDate = habitStartDate < creationDate ? habitStartDate : creationDate;
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const startD = earliestHabitDate < ninetyDaysAgo ? earliestHabitDate : ninetyDaysAgo;
      
      const logs = await getLogRange(
        formatDate(startD),
        endDate
      );

      const computed = generateHabitAnalytics(habit, logs, weeklyResetDay);
      setStats(computed);
    }
    load();
  }, [habit, weeklyResetDay]);

  if (!stats) return <div className="habit-deep-dive loading">Analyzing...</div>;

  // Group the 24 hours into 4 periods
  const morningCount = stats.timeOfDayDistribution.slice(6, 12).reduce((a, b) => a + b, 0);
  const afternoonCount = stats.timeOfDayDistribution.slice(12, 18).reduce((a, b) => a + b, 0);
  const eveningCount = stats.timeOfDayDistribution.slice(18, 22).reduce((a, b) => a + b, 0);
  const nightCount = [
    ...stats.timeOfDayDistribution.slice(22, 24),
    ...stats.timeOfDayDistribution.slice(0, 6)
  ].reduce((a, b) => a + b, 0);

  const periods = [
    { label: "Morning", range: "6 AM – 12 PM", count: morningCount, icon: "🌅" },
    { label: "Afternoon", range: "12 PM – 6 PM", count: afternoonCount, icon: "☀️" },
    { label: "Evening", range: "6 PM – 10 PM", count: eveningCount, icon: "🌇" },
    { label: "Night", range: "10 PM – 6 AM", count: nightCount, icon: "🌙" },
  ];

  const totalCompletions = periods.reduce((sum, p) => sum + p.count, 0);
  const maxPeriodCount = Math.max(...periods.map(p => p.count), 1);
  const peakPeriod = periods.reduce((prev, current) => (prev.count > current.count) ? prev : current, periods[0]);

  return (
    <div className="habit-deep-dive">
      <div className="hdd-header">
        <h2 className="t-display">[ {habit.title.toUpperCase()} ]</h2>
        <button onClick={onClose} className="btn-close"><X size={24} /></button>
      </div>

      <div className="hdd-grid">
        <div className="analytics-card metric-card">
          <span className="t-label text-muted">ALL-TIME RATE</span>
          <span className="t-display">{stats.completionRateAllTime}%</span>
        </div>
        <div className="analytics-card metric-card">
          <span className="t-label text-muted">CURRENT STREAK</span>
          <span className="t-display">{habit.currentStreak} <span>days</span></span>
        </div>
        <div className="analytics-card metric-card">
          <span className="t-label text-muted">LONGEST STREAK</span>
          <span className="t-display">{habit.longestStreak} <span>days</span></span>
        </div>

        <div className="analytics-card heatmap-wrapper">
          <h3 className="t-label">[ ACTIVITY HISTORY ]</h3>
          <ActivityHeatmap habit={habit} habitId={habit.id} />
        </div>

        <div className="analytics-card tod-chart">
          <h3 className="t-label">[ TIME OF DAY ]</h3>
          <div className="tod-content">
            <div className="tod-summary-box">
              <span className="tod-summary-title">Peak Activity</span>
              {totalCompletions > 0 ? (
                <p className="tod-summary-highlight">
                  Most active during <span>{peakPeriod.label}</span> ({peakPeriod.icon}) with <span>{peakPeriod.count}</span> completion{peakPeriod.count !== 1 ? 's' : ''}.
                </p>
              ) : (
                <p className="tod-summary-highlight" style={{ opacity: 0.6 }}>
                  No completion times recorded yet.
                </p>
              )}
            </div>
            <div className="tod-progress-list">
              {periods.map((p) => {
                const percent = totalCompletions > 0 ? (p.count / maxPeriodCount) * 100 : 0;
                return (
                  <div key={p.label} className="tod-row">
                    <span className="tod-row-icon">{p.icon}</span>
                    <div className="tod-row-info">
                      <span className="tod-row-label">{p.label}</span>
                      <span className="tod-row-range">{p.range}</span>
                    </div>
                    <div className="tod-progress-container">
                      <motion.div
                        className="tod-progress-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                      />
                    </div>
                    <span className="tod-row-count">{p.count} {p.count === 1 ? 'log' : 'logs'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
