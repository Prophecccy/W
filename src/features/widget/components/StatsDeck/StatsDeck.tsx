import './StatsDeck.css';

interface StatsDeckProps {
  completedCount: number;
  totalScheduled: number;
  strikeCount: number;
  strikeSystemEnabled?: boolean;
  globalStreak: number;
  weeklyCompletions: number;
}

export function StatsDeck({
  completedCount,
  totalScheduled,
  strikeCount,
  strikeSystemEnabled = true,
  globalStreak,
  weeklyCompletions,
}: StatsDeckProps) {
  const progress = totalScheduled > 0 ? completedCount / totalScheduled : 0;
  const progressPercentage = Math.round(progress * 100);

  return (
    <div className="stats-deck">
      {/* Horizontal Stats Row */}
      <div className="stats-deck__stats-row">
        <div className="stats-deck__stat-item">
          <span className="stats-deck__stat-label">COMPLETED</span>
          <span className="stats-deck__stat-value t-data">{completedCount}</span>
        </div>

        <div className="stats-deck__stat-divider" />

        <div className="stats-deck__stat-item">
          <span className="stats-deck__stat-label">TOTAL</span>
          <span className="stats-deck__stat-value t-data">{totalScheduled}</span>
        </div>

        <div className="stats-deck__stat-divider" />

        <div className="stats-deck__stat-item">
          <span className="stats-deck__stat-label">PROGRESS</span>
          <span className="stats-deck__stat-value t-data">{progressPercentage}%</span>
        </div>
      </div>

      {/* Footer showing Streak, Weekly and Strikes */}
      <div className="stats-deck__footer">
        <span className="stats-deck__status">STREAK {globalStreak}D</span>
        <div className="stats-deck__divider">|</div>
        <span className="stats-deck__status">WEEKLY {weeklyCompletions}</span>
        {strikeSystemEnabled && (
          <>
            <div className="stats-deck__divider">|</div>
            <span className={`stats-deck__strikes ${strikeCount > 0 ? 'stats-deck__strikes--active' : ''}`}>
              {strikeCount > 0 ? `${strikeCount} STRIKES` : '0 STRIKES'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
