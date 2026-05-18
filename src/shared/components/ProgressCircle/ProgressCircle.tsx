import './ProgressCircle.css';

interface ProgressCircleProps {
  completedCount: number;
  totalScheduled: number;
  tiny?: boolean;
  size?: number;
}

export function ProgressCircle({
  completedCount,
  totalScheduled,
  tiny = false,
  size,
}: ProgressCircleProps) {
  const progress = totalScheduled > 0 ? completedCount / totalScheduled : 0;
  
  if (tiny) {
    const defaultSize = size || 32;
    const radius = 12;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - progress);
    
    return (
      <div 
        className="progress-circle progress-circle--tiny" 
        style={{ width: defaultSize, height: defaultSize }}
      >
        <svg className="progress-circle__svg" width="100%" height="100%" viewBox="0 0 32 32">
          {/* ONLY the accent-colored track is rendered for tiny progress track */}
          <circle
            cx="16" cy="16" r={radius}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="progress-circle__progress-track"
          />
        </svg>
      </div>
    );
  }

  // Standard Mode
  const defaultSize = size || 52;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div 
      className="progress-circle" 
      style={{ width: defaultSize, height: defaultSize }}
    >
      <svg className="progress-circle__svg" width="100%" height="100%" viewBox="0 0 52 52">
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
          className="progress-circle__progress-track"
        />
      </svg>
      <div className="progress-circle__center-text">
        {Math.round(progress * 100)}%
      </div>
    </div>
  );
}
