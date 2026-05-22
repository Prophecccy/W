import "./LockdownLogo.css";

interface LockdownLogoProps {
  isActive: boolean;
  size?: number;
  className?: string;
}

export function LockdownLogo({ isActive, size = 160, className = "" }: LockdownLogoProps) {
  const uniqueId = `shield-clip-${isActive ? "active" : "inactive"}`;

  return (
    <div
      className={`lockdown-logo ${isActive ? "lockdown-logo--active" : "lockdown-logo--inactive"} ${className}`}
      style={{
        width: size,
        height: size,
        "--logo-size": `${size}px`,
      } as React.CSSProperties}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="lockdown-logo__svg"
      >
        <defs>
          {/* Clip path of the shield so inner glowing elements/stripes fit perfectly */}
          <clipPath id={uniqueId}>
            <path d="M 50 20 L 72 26 L 72 48 C 72 65 60 76 50 82 C 40 76 28 65 28 48 L 28 26 Z" />
          </clipPath>

          {/* Glow filter for maximum tactical neon immersion */}
          <filter id="glow-heavy" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          
          <filter id="glow-subtle" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ─── LAYER 1: Background Grid Scanner ─── */}
        <circle cx="50" cy="50" r="48" className="logo-hud-circle-grid" />
        
        {/* ─── LAYER 2: Outer Monospace Telemetry Brackets ─── */}
        {/* Top-Left Bracket */}
        <path d="M 12 28 L 8 28 L 8 16 L 20 16 L 20 20" className="logo-hud-bracket" />
        {/* Top-Right Bracket */}
        <path d="M 88 28 L 92 28 L 92 16 L 80 16 L 80 20" className="logo-hud-bracket" />
        {/* Bottom-Left Bracket */}
        <path d="M 12 72 L 8 72 L 8 84 L 20 84 L 20 80" className="logo-hud-bracket" />
        {/* Bottom-Right Bracket */}
        <path d="M 88 72 L 92 72 L 92 84 L 80 84 L 80 80" className="logo-hud-bracket" />

        {/* ─── LAYER 3: Concentric Dashed Telemetry Rings ─── */}
        <circle cx="50" cy="50" r="45" className="logo-hud-ring-outer" />
        <circle cx="50" cy="50" r="39" className="logo-hud-ring-middle" />
        <circle cx="50" cy="50" r="33" className="logo-hud-ring-inner" />

        {/* ─── LAYER 4: Shield Frame & Warning Grid (Clipped) ─── */}
        <g clipPath={`url(#${uniqueId})`}>
          {/* Cyber scanner sweep line */}
          <line x1="10" y1="0" x2="90" y2="0" className="logo-scanline" />
          
          {/* Tactical grid background */}
          <rect x="20" y="15" width="60" height="70" className="logo-shield-grid" />
          
          {/* Diagonal Hazard Alert Stripes */}
          <g className="logo-hazard-stripes">
            <line x1="20" y1="20" x2="80" y2="80" strokeWidth="3" />
            <line x1="5" y1="20" x2="65" y2="80" strokeWidth="3" />
            <line x1="35" y1="20" x2="95" y2="80" strokeWidth="3" />
            <line x1="-10" y1="20" x2="50" y2="80" strokeWidth="3" />
            <line x1="50" y1="20" x2="110" y2="80" strokeWidth="3" />
          </g>
        </g>

        {/* ─── LAYER 5: Main Shield Vector Contour ─── */}
        <path
          d="M 50 20 L 72 26 L 72 48 C 72 65 60 76 50 82 C 40 76 28 65 28 48 L 28 26 Z"
          className="logo-shield-outline"
        />

        {/* ─── LAYER 6: Mechanical Lock Core ─── */}
        <g className="logo-lock-group">
          {/* Lock Shackle (Morphs downward & rotates depending on state) */}
          <path
            d="M 43 46 V 38 C 43 33.5, 57 33.5, 57 38 V 46"
            className="logo-shackle"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Lock Body */}
          <rect
            x="37"
            y="44"
            width="26"
            height="18"
            rx="3"
            className="logo-lock-body"
            strokeWidth="2"
          />
          {/* Keyhole indicator */}
          <circle cx="50" cy="51" r="2.5" className="logo-lock-core" />
          <path d="M 50 53 L 50 58" className="logo-lock-core-pin" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* ─── LAYER 7: Tactical Crosshairs (Only Active Inactive) ─── */}
        <g className="logo-crosshairs">
          <line x1="50" y1="8" x2="50" y2="14" strokeWidth="1" />
          <line x1="50" y1="86" x2="50" y2="92" strokeWidth="1" />
          <line x1="8" y1="50" x2="14" y2="50" strokeWidth="1" />
          <line x1="86" y1="50" x2="92" y2="50" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}
