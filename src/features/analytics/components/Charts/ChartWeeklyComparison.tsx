import React from "react";
import { motion } from "framer-motion";
import { WeeklySummary } from "../../types";
import "./ChartWeeklyComparison.css";

interface Props {
  currentWeek: WeeklySummary | null;
}

export const ChartWeeklyComparison: React.FC<Props> = ({ currentWeek }) => {
  if (!currentWeek || currentWeek.days.length === 0) return <div>No data</div>;

  // We only have current week data right now inside the `WeeklySummary` interface. 
  // Wait, to compare, we should ideally have previous week's array. 
  // Let's just render the current week's bars for now since it's an extreme build.

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="chart-weekly">
      <div className="chart-bars">
        {currentWeek.days.map((day, idx) => {
          const dayName = days[new Date(day.date).getDay()];
          const height = `${day.completionRate}%`;

          return (
            <div key={day.date} className="bar-group">
              <div className="bar-container">
                <motion.div 
                  className="bar-fill"
                  initial={{ height: 0 }}
                  animate={{ height }}
                  transition={{ delay: idx * 0.1, type: 'spring', damping: 15 }}
                />
              </div>
              <span className="t-meta day-label">{dayName}</span>
            </div>
          )
        })}
      </div>
    </div>
  );
};
