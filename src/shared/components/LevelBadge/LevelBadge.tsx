import "./LevelBadge.css";

interface LevelBadgeProps {
  level: number;
  className?: string;
  lowGraphics?: boolean;
}

export function LevelBadge({ level, className = "", lowGraphics = false }: LevelBadgeProps) {
  // Cap semantic tiers between 0 and 10
  const tier = Math.min(Math.max(level, 0), 10);
  const baseClass = `level-badge level-tier-${tier} ${lowGraphics ? 'low-graphics' : ''} ${className}`;

  return (
    <div className={baseClass}>
      <span className="level-badge__text">Lv.{level}</span>
      {/* Elements for advanced rendering on higher tiers */}
      {!lowGraphics && tier >= 6 && <div className="level-badge__shimmer" />}
    </div>
  );
}
