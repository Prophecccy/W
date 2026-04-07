import React from "react";
import { motion } from "framer-motion";
import { WeeklySummary } from "../../types";
import "./ChartWeeklyComparison.css";

interface Props {
  currentWeek: WeeklySummary | null;
}

export const ChartWeeklyComparison: React.FC<Props> = ({ currentWeek }) => {
  if (!currentWeek || currentWeek.days.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
        <span className="t-meta">Complete habits this week to see trends</span>
      </div>
    );
  }

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hasAnyData = currentWeek.days.some(d => d.totalScheduled > 0);

  return (
    <div className="chart-weekly" style={{ position: 'relative' }}>
      <div className="chart-bars" style={{ opacity: hasAnyData ? 1 : 0.3, pointerEvents: hasAnyData ? 'auto' : 'none' }}>
        {currentWeek.days.map((day, idx) => {
          const dayName = days[new Date(day.date + "T00:00:00").getDay()];
          // Show at least a tiny sliver for days with scheduled habits (even if 0% completed)
          const height = day.totalScheduled > 0 
            ? `${Math.max(day.completionRate, 3)}%` 
            : '0%';

          return (
            <div key={day.date} className="bar-group">
              <div className="bar-container">
                <motion.div 
                  className="bar-fill"
                  initial={{ height: 0 }}
                  animate={{ height }}
                  transition={{ delay: idx * 0.1, type: 'spring', damping: 15 }}
                  title={`${day.completionRate}% (${day.totalCompleted}/${day.totalScheduled})`}
                />
              </div>
              <span className="t-meta day-label">{dayName}</span>
            </div>
          )
        })}
      </div>
      
      {!hasAnyData && (
        <div style={{ 
          position: 'absolute', 
          inset: 0, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          <span className="t-meta" style={{ 
            background: 'var(--bg-main)', 
            padding: '6px 14px', 
            borderRadius: '6px', 
            border: '1px solid var(--border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            No activity this week yet
          </span>
        </div>
      )}
    </div>
  );
};
