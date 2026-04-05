import React from "react";
import "./ProgressRing.css";

interface ProgressRingProps {
  radius: number;
  stroke: number;
  progress: number; // 0 to 100
  color?: string;
  className?: string;
}

export function ProgressRing({ radius, stroke, progress, color, className = "" }: ProgressRingProps) {
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg
      height={radius * 2}
      width={radius * 2}
      className={`progress-ring ${className}`}
      style={{ '--stroke-color': color } as React.CSSProperties}
    >
      <circle
        className="progress-ring__circle-bg"
        stroke="var(--border-default)"
        strokeWidth={stroke}
        fill="transparent"
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <circle
        className="progress-ring__circle-fg"
        stroke="var(--stroke-color, var(--accent))"
        strokeWidth={stroke}
        strokeDasharray={circumference + " " + circumference}
        style={{ strokeDashoffset }}
        fill="transparent"
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
    </svg>
  );
}
