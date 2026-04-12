import { useRef, useEffect, useCallback } from "react";
import { useTimeLeft } from "../../hooks/useTimeLeft";
import "./TimeTube.css";

interface TimeTubeProps {
  wakeUpTime: string;
  bedTime: string;
  accentColor: string;
  lowGraphicsMode?: boolean;
}

// ─── Color helpers ──────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return [r, g, b];
}

function darken(rgb: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.round(rgb[0] * factor),
    Math.round(rgb[1] * factor),
    Math.round(rgb[2] * factor),
  ];
}

// ─── Bubble particle ────────────────────────────────────────────
interface Bubble {
  x: number;        // 0..1 normalized
  y: number;        // pixel from bottom
  radius: number;
  speed: number;
  wobble: number;
  wobbleSpeed: number;
  opacity: number;
}

function createBubble(): Bubble {
  return {
    x: 0.2 + Math.random() * 0.6,
    y: 0,
    radius: 1 + Math.random() * 2.5,
    speed: 0.3 + Math.random() * 0.7,
    wobble: 0,
    wobbleSpeed: 0.02 + Math.random() * 0.03,
    opacity: 0.15 + Math.random() * 0.35,
  };
}

export function TimeTube({ wakeUpTime, bedTime, accentColor, lowGraphicsMode }: TimeTubeProps) {
  const timeLeft = useTimeLeft({ wakeUpTime, bedTime, lowFrequency: lowGraphicsMode });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const frameRef = useRef(0);
  const timeRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Resize canvas buffer if needed
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, w, h);
    timeRef.current += 0.016; // ~60fps
    const t = timeRef.current;

    const fillPct = timeLeft.percentage;
    const fillHeight = fillPct * h;
    const surfaceY = h - fillHeight; // Y from top where liquid surface is

    if (fillHeight <= 0) return;

    const rgb = hexToRgb(accentColor);
    const darkRgb = darken(rgb, 0.5);

    // ─── Liquid body gradient ───────────────────────────────
    const bodyGrad = ctx.createLinearGradient(0, surfaceY, 0, h);
    bodyGrad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.8)`);
    bodyGrad.addColorStop(0.4, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.65)`);
    bodyGrad.addColorStop(1, `rgba(${darkRgb[0]}, ${darkRgb[1]}, ${darkRgb[2]}, 0.9)`);

    // ─── Draw liquid body with wave surface ─────────────────
    ctx.beginPath();
    ctx.moveTo(0, h);

    // Multi-sine wave surface
    for (let x = 0; x <= w; x++) {
      const nx = x / w;
      const wave1 = Math.sin(nx * Math.PI * 3 + t * 1.5) * 3;
      const wave2 = Math.sin(nx * Math.PI * 5 + t * 2.3 + 1.2) * 1.5;
      const wave3 = Math.sin(nx * Math.PI * 7 + t * 0.8 + 2.7) * 0.8;
      const waveY = surfaceY + wave1 + wave2 + wave3;
      ctx.lineTo(x, waveY);
    }

    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // ─── Glossy highlight on left edge ──────────────────────
    const gloss = ctx.createLinearGradient(0, 0, w * 0.35, 0);
    gloss.addColorStop(0, `rgba(255, 255, 255, 0.12)`);
    gloss.addColorStop(1, `rgba(255, 255, 255, 0)`);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w * 0.4; x++) {
      const nx = x / w;
      const wave1 = Math.sin(nx * Math.PI * 3 + t * 1.5) * 3;
      const waveY = surfaceY + wave1;
      ctx.lineTo(x, waveY);
    }
    ctx.lineTo(w * 0.4, h);
    ctx.closePath();
    ctx.fillStyle = gloss;
    ctx.fill();

    // ─── Bubbles ────────────────────────────────────────────
    const bubbles = bubblesRef.current;

    // Maybe spawn a new bubble
    if (Math.random() < 0.02 && bubbles.length < 8 && fillHeight > 20) {
      bubbles.push(createBubble());
    }

    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y += b.speed;
      b.wobble += b.wobbleSpeed;
      const bx = b.x * w + Math.sin(b.wobble) * 3;
      const by = h - b.y;

      // Remove if above surface
      if (by < surfaceY - 5) {
        bubbles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(bx, by, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${b.opacity})`;
      ctx.fill();
    }

    // ─── Meniscus (concave surface at edges) ────────────────
    ctx.beginPath();
    const meniscusH = 4;
    ctx.moveTo(0, surfaceY - meniscusH);
    ctx.quadraticCurveTo(w / 2, surfaceY + meniscusH, w, surfaceY - meniscusH);
    ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.3)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [timeLeft.percentage, accentColor]);

  // ─── Animation loop ────────────────────────────────────────
  useEffect(() => {
    if (lowGraphicsMode) return; // No canvas animation in low-graphics

    let running = true;
    const tick = () => {
      if (!running) return;
      if (!document.hidden) {
        draw();
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [draw, lowGraphicsMode]);

  // ─── Low graphics fallback: simple CSS fill ────────────────
  if (lowGraphicsMode) {
    return (
      <div className="time-tube">
        <div className="time-tube__glass">
          <div
            className="time-tube__fill-simple"
            style={{
              height: `${timeLeft.percentage * 100}%`,
              backgroundColor: accentColor,
            }}
          />
        </div>
        <div className="time-tube__label t-meta">
          {timeLeft.hoursLeft}h {timeLeft.minutesLeft}m
        </div>
      </div>
    );
  }

  return (
    <div className="time-tube">
      <div className="time-tube__glass">
        <canvas ref={canvasRef} className="time-tube__canvas" />
      </div>
      <div className="time-tube__label t-meta">
        {timeLeft.hoursLeft}h {timeLeft.minutesLeft}m
      </div>
    </div>
  );
}
