import React from "react";
import "./ConsistencyScore.css";

interface Props {
  rate: number; // 0-100
  label?: string;
  size?: number;
}

export const ConsistencyScore: React.FC<Props> = ({ rate, label = "CONSISTENCY", size = 120 }) => {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (rate / 100) * circumference;

  return (
    <div className="consistency-score" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size/2}
          cy={size/2}
          r={radius}
          fill="none"
          stroke="var(--bg-overlay)"
          strokeWidth={stroke}
        />
        <circle
          cx={size/2}
          cy={size/2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="consistency-text">
        <span className="t-display">{Math.round(rate)}%</span>
        <span className="t-meta text-muted">{label}</span>
      </div>
    </div>
  );
};
