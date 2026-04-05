import { useState, useEffect } from 'react';
import './PowerHub.css';

interface PowerHubProps {
  completedCount: number;
  totalScheduled: number;
  globalStreak: number;
  strikeCount: number;
  weeklyCompletions: number;
  isFrozen: boolean;
}

export function PowerHub({
  completedCount,
  totalScheduled,
  globalStreak,
  strikeCount,
  weeklyCompletions,
  isFrozen,
}: PowerHubProps) {
  const [time, setTime] = useState(new Date());

  // Live clock — update every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');

  // Progress ring calculations
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const progress = totalScheduled > 0 ? completedCount / totalScheduled : 0;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="powerhub">
      {/* Digital Clock */}
      <div className="powerhub__clock t-display">
        [ {hours}:{minutes} ]
      </div>

      {/* Progress Ring */}
      <div className="powerhub__ring-container">
        <svg className="powerhub__ring" width="120" height="120" viewBox="0 0 120 120">
          {/* Background track */}
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth="8"
          />
          {/* Progress arc */}
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="powerhub__ring-progress"
          />
        </svg>
        <div className="powerhub__ring-center t-data">
          {completedCount}/{totalScheduled}
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="powerhub__stats">
        <div className="powerhub__stat" title="Current Streak">
          <span className="powerhub__stat-icon">🔥</span>
          <span className="t-data">
            {isFrozen ? '⏸ FROZEN' : globalStreak}
          </span>
        </div>
        <div className="powerhub__stat" title="Strikes">
          <span className="powerhub__stat-icon">⚠️</span>
          <span className="t-data">{strikeCount}/5</span>
        </div>
        <div className="powerhub__stat" title="Today">
          <span className="powerhub__stat-icon">📈</span>
          <span className="t-data">{weeklyCompletions}</span>
        </div>
      </div>
    </div>
  );
}
