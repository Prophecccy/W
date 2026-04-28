import { useState, useEffect } from 'react';
import './PowerHub.css';

interface PowerHubProps {
  completedCount: number;
  totalScheduled: number;
}

export function PowerHub({
  completedCount,
  totalScheduled,
}: PowerHubProps) {
  const [time, setTime] = useState(new Date());

  // Live clock — update every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');

  // Progress ring calculations
  const radius = 22; // smaller radius to match image proportion
  const circumference = 2 * Math.PI * radius;
  const progress = totalScheduled > 0 ? completedCount / totalScheduled : 0;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="powerhub">
      {/* Header Row */}
      <div className="powerhub__header">
        <span className="powerhub__title">[ POWERHUB ]</span>
        <span className="powerhub__t-minus">T-MINUS 01:45</span>
      </div>

      {/* Main Row: Ring and Clock */}
      <div className="powerhub__main">
        <div className="powerhub__ring-container">
          <svg className="powerhub__ring" width="100%" height="100%" viewBox="0 0 52 52">
            <circle
              cx="26" cy="26" r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="4"
            />
            <circle
              cx="26" cy="26" r={radius}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="powerhub__ring-progress"
            />
          </svg>
          <div className="powerhub__ring-center">
            {Math.round(progress * 100)}%
          </div>
        </div>

        <div className="powerhub__clock">
          {hours}:{minutes}:{seconds}
        </div>
      </div>

      {/* Strikes removed: located in Widget footer now */}

      {/* Footer */}
      <div className="powerhub__footer">
        DECK STATUS: NOMINAL
      </div>
    </div>
  );
}
