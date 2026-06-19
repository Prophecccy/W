import "./FlameIcon.css";

interface FlameIconProps {
  streak: number;
  width?: number;
  height?: number;
  className?: string;
  lowGraphics?: boolean;
}

export function FlameIcon({ streak, width = 14, height = 14, className = "", lowGraphics = false }: FlameIconProps) {
  // Determine tier based on streak
  let tier = 1;
  if (streak >= 365) tier = 7;
  else if (streak >= 200) tier = 6;
  else if (streak >= 100) tier = 5;
  else if (streak >= 60) tier = 4;
  else if (streak >= 30) tier = 3;
  else if (streak >= 7) tier = 2;

  const baseClass = `flame-icon flame-tier-${tier} ${lowGraphics ? 'low-graphics' : ''} ${className}`;

  return (
    <div className={baseClass} style={{ width, height }}>
      <svg 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="flame-svg-outer"
      >
        <path
          d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
          fill="currentColor"
        />
        {/* Inner flame core for Tier 3+ */}
        {tier >= 3 && !lowGraphics && (
           <path
             className="flame-svg-inner"
             d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
             transform="translate(6, 6) scale(0.5)"
             fill="#FFF"
           />
        )}
      </svg>
      {/* Tier specific pseudo elements are handled mostly via CSS, but particles for tier 4+ can be rendered as pure CSS or extra DOM nodes */}
      {!lowGraphics && tier >= 4 && (
        <div className="flame-particles">
          <div className="particle p1" />
          <div className="particle p2" />
          <div className="particle p3" />
        </div>
      )}
    </div>
  );
}
