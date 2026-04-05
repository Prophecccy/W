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
          d="M11.6667 1.33334C11.6667 1.33334 16 6.33334 16 10.3333C16 11.5173 15.6596 12.6781 15.0298 13.6826C14.4 14.6872 13.5042 15.4988 12.4444 16.0272C12.4444 16.0272 14.3333 11 12 7.66668C12 7.66668 11.4444 14.4444 7 13.6667C7 10.8889 10.3333 4.33334 11.6667 1.33334Z"
          fill="currentColor"
        />
        <path
          d="M12.4444 16.0272C13.5042 15.4988 14.4 14.6872 15.0298 13.6826C16.8924 16.6577 15.1111 22.3333 11.6667 22.3333C8.22222 22.3333 5.33333 18.6667 7 13.6667C7.44444 16.3333 10.7778 18 12.4444 16.0272Z"
          fill="currentColor"
        />
        {/* Inner flame for Tier 3+ */}
        {tier >= 3 && !lowGraphics && (
           <path
             className="flame-svg-inner"
             d="M12 11C12 11 14 14 14 16C14 17.5 12.5 19 11.5 19C10.5 19 9.5 17 10 15C10 15 11 15 12 11Z"
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
