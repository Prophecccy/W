import React from "react";
import { motion } from "framer-motion";
import { MonthlySummary } from "../../types";
import "./ChartMonthlyComparison.css";

interface Props {
  currentMonth: MonthlySummary | null;
}

export const ChartMonthlyComparison: React.FC<Props> = ({ currentMonth }) => {
  if (!currentMonth || currentMonth.days.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
        <span className="t-meta">Activity trend builds over time</span>
      </div>
    );
  }

  const w = 400; // viewBox width
  const h = 180; // viewBox height

  // Map rates to SVG coordinates
  // X: 0 to width, Y: height (0%) to 0 (100%)
  const stepX = w / Math.max(1, currentMonth.days.length - 1);
  
  const generatePath = () => {
    let path = `M 0,${h - (currentMonth.days[0].completionRate / 100) * h}`;
    
    currentMonth.days.forEach((day, i) => {
      if (i === 0) return;
      const x = i * stepX;
      const y = h - (day.completionRate / 100) * h;
      path += ` L ${x},${y}`;
    });

    return path;
  };

  return (
    <div className="chart-monthly">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="monthly-svg">
        
        {/* Grid lines */}
        <line x1="0" y1={h/2} x2={w} y2={h/2} className="grid-line" strokeDasharray="4 4" />
        <line x1="0" y1={0} x2={w} y2={0} className="grid-line" strokeDasharray="4 4" />
        <line x1="0" y1={h} x2={w} y2={h} className="grid-line" />

        <motion.path
          d={generatePath()}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
};
