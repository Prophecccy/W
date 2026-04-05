import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Habit } from "../../habits/types";
import { HabitAnalytics } from "../types";
import { generateHabitAnalytics } from "../services/analyticsService";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { getLogRange } from "../../habits/services/logService";
import { getToday } from "../../../shared/utils/dateUtils";
import { motion } from "framer-motion";
import "./HabitDeepDive.css";

interface Props {
  habit: Habit;
  onClose: () => void;
}

export const HabitDeepDive: React.FC<Props> = ({ habit, onClose }) => {
  const [stats, setStats] = useState<HabitAnalytics | null>(null);

  useEffect(() => {
    async function load() {
      // Load last 90 days
      const endDate = getToday();
      const endD = new Date(endDate + "T00:00:00");
      const startD = new Date(endD);
      startD.setDate(startD.getDate() - 89);
      
      const logs = await getLogRange(
        startD.toISOString().split("T")[0], 
        endDate
      );

      const computed = generateHabitAnalytics(habit, logs);
      setStats(computed);
    }
    load();
  }, [habit]);

  if (!stats) return <div className="habit-deep-dive loading">Analyzing...</div>;

  const maxHourVal = Math.max(...stats.timeOfDayDistribution, 1);

  return (
    <div className="habit-deep-dive">
      <div className="hdd-header">
        <h2 className="t-display">{habit.title}</h2>
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
          <ActivityHeatmap endDate={getToday()} daysCount={90} habitId={habit.id} />
        </div>

        <div className="analytics-card tod-chart">
          <h3 className="t-label">[ TIME OF DAY ]</h3>
          <div className="tod-bars">
            {stats.timeOfDayDistribution.map((count, hour) => {
              const hPercent = (count / maxHourVal) * 100;
              return (
                <div key={hour} className="tod-bar-group" title={`${hour}:00 - ${count} completions`}>
                  <div className="tod-bar-container">
                    <motion.div 
                      className="tod-bar-fill"
                      initial={{ height: 0 }}
                      animate={{ height: `${hPercent}%` }}
                    />
                  </div>
                  <span className="t-meta tod-label">{hour % 4 === 0 ? `${hour}h` : ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
