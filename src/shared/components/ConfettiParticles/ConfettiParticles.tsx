import React, { useEffect, useState } from "react";
import "./ConfettiParticles.css";

interface ConfettiParticlesProps {
  x?: number;
  y?: number;
  particleCount?: number;
  onComplete?: () => void;
  lowGraphics?: boolean;
}

export function ConfettiParticles({ x = 0, y = 0, particleCount = 12, onComplete, lowGraphics = false }: ConfettiParticlesProps) {
  const [mounted, setMounted] = useState(true);

  // Auto clean up component
  useEffect(() => {
    if (lowGraphics) {
       setMounted(false);
       if (onComplete) onComplete();
       return;
    }
    const timer = setTimeout(() => {
      setMounted(false);
      if (onComplete) onComplete();
    }, 800);
    return () => clearTimeout(timer);
  }, [onComplete, lowGraphics]);

  if (!mounted || lowGraphics) return null;

  const particles = Array.from({ length: particleCount }).map((_, i) => {
    // Random angle 0-360
    const angle = Math.random() * Math.PI * 2;
    // Random distance 20-60px
    const distance = 20 + Math.random() * 40;
    
    // Target translation
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    // Random rotation
    const rot = Math.random() * 360;
    
    return (
      <div 
        key={i} 
        className="confetti-p"
        style={{
          "--tx": `${tx}px`,
          "--ty": `${ty}px`,
          "--rot": `${rot}deg`,
        } as React.CSSProperties}
      />
    );
  });

  return (
    <div className="confetti-container" style={{ left: x, top: y }}>
      {particles}
    </div>
  );
}
