import { useState, useRef, useCallback, useEffect } from 'react';
import './RadialTimePicker.css';

interface RadialTimePickerProps {
  value: string;        // "HH:MM"
  onChange: (val: string) => void;
  onClose: () => void;
}

type Mode = 'HOURS' | 'MINUTES';

// ─── Constants ────────────────────────────────────────────────────────────────
const DIAL_SIZE = 220;          // px — total SVG/canvas size
const CENTER = DIAL_SIZE / 2;   // 110
const OUTER_R = 82;             // radius for outer ring numbers
const INNER_R = 52;             // radius for inner ring numbers (13-00)
const DOT_R   = 14;             // radius of the accent dot behind selected number

// ─── Math helpers ─────────────────────────────────────────────────────────────

/** Convert (dx,dy) from center → 0-360 angle, where 0 = top (12 o'clock). */
function angleFromCenter(dx: number, dy: number): number {
  // atan2 gives angle from +x axis; we rotate by -90° so 0° = top
  let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  if (deg < 0) deg += 360;
  return deg;
}

/** Place a number on the clock face. Returns {x, y} in SVG space. */
function polarToXY(angle: number, radius: number): { x: number; y: number } {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(rad),
    y: CENTER + radius * Math.sin(rad),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function RadialTimePicker({ value, onChange, onClose }: RadialTimePickerProps) {
  const [hStr, mStr] = value.split(':');
  const initH = parseInt(hStr, 10) || 0;
  const initM = parseInt(mStr, 10) || 0;

  const [hours, setHours]   = useState(initH);
  const [minutes, setMins]  = useState(initM);
  const [mode, setMode]     = useState<Mode>('HOURS');
  const [dragging, setDrag] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [onClose]);

  // ── Pointer angle → value ─────────────────────────────────────────────────
  const computeFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = clientX - (rect.left + CENTER * (rect.width / DIAL_SIZE));
    const dy = clientY - (rect.top  + CENTER * (rect.height / DIAL_SIZE));
    const angle = angleFromCenter(dx, dy);

    if (mode === 'HOURS') {
      // Snap to 12 positions (30° each). Determine inner vs outer by distance.
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scaleFactor = rect.width / DIAL_SIZE;
      // 0° snap = hour 12 on outer ring, 0 on inner ring
      let h = Math.round(angle / 30) % 12;
      if (dist < (INNER_R + 18) * scaleFactor) {
        // Inner ring: 0, 13, 14...23
        h = h === 0 ? 0 : h + 12;
      } else {
        // Outer ring: 1..12
        h = h === 0 ? 12 : h;
      }
      setHours(h);
    } else {
      // Snap to 60 positions (6° each)
      const snap = Math.round(angle / 6) % 60;
      setMins(snap < 0 ? snap + 60 : snap);
    }
  }, [mode]);

  // ── Pointer events ────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(true);
    computeFromPointer(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    computeFromPointer(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(false);
    // After releasing in HOURS mode → switch to MINUTES automatically
    if (mode === 'HOURS') {
      setMode('MINUTES');
    } else {
      // Confirm selection
      const h = String(hours).padStart(2, '0');
      const m = String(minutes).padStart(2, '0');
      onChange(`${h}:${m}`);
      onClose();
    }
  };

  // ── Build clock face elements ─────────────────────────────────────────────
  type ClockNum = { label: string; value: number; x: number; y: number; ring: 'outer' | 'inner' };

  const clockNumbers: ClockNum[] = [];

  if (mode === 'HOURS') {
    // Outer ring: 1–12
    for (let i = 1; i <= 12; i++) {
      const angle = i * 30;
      const { x, y } = polarToXY(angle, OUTER_R);
      clockNumbers.push({ label: String(i), value: i, x, y, ring: 'outer' });
    }
    // Inner ring: 13–23, 00
    for (let i = 0; i <= 11; i++) {
      const v = i === 0 ? 0 : i + 12;
      const angle = (i === 0 ? 0 : i) * 30;
      const { x, y } = polarToXY(angle, INNER_R);
      clockNumbers.push({ label: i === 0 ? '00' : String(v), value: v, x, y, ring: 'inner' });
    }
  } else {
    // Minutes: 0, 5, 10 … 55
    for (let i = 0; i < 12; i++) {
      const v = i * 5;
      const angle = i * 30;
      const { x, y } = polarToXY(angle, OUTER_R);
      clockNumbers.push({ label: String(v).padStart(2, '0'), value: v, x, y, ring: 'outer' });
    }
  }

  // ── Current hand position ─────────────────────────────────────────────────
  let handAngle: number;
  let handRadius: number;

  if (mode === 'HOURS') {
    if (hours === 0 || (hours >= 13 && hours <= 23)) {
      // Inner ring
      const h = hours === 0 ? 0 : hours - 12;
      handAngle = h * 30;
      handRadius = INNER_R;
    } else {
      handAngle = hours * 30;
      handRadius = OUTER_R;
    }
  } else {
    handAngle = (minutes / 60) * 360;
    handRadius = OUTER_R;
  }

  const handTip = polarToXY(handAngle, handRadius);
  const handMid = polarToXY(handAngle, handRadius - DOT_R);

  // ── Readout ───────────────────────────────────────────────────────────────
  const readoutH = String(hours).padStart(2, '0');
  const readoutM = String(minutes).padStart(2, '0');

  // ── Confirm by pressing Enter ─────────────────────────────────────────────
  const handleConfirm = () => {
    const h = String(hours).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    onChange(`${h}:${m}`);
    onClose();
  };

  return (
    <div className="rtp-overlay" ref={overlayRef}>
      {/* ── Digital Readout ─────────────────────────────────────────────── */}
      <div className="rtp-readout">
        <button
          className={`rtp-readout__seg ${mode === 'HOURS' ? 'rtp-readout__seg--active' : ''}`}
          onClick={() => setMode('HOURS')}
        >
          {readoutH}
        </button>
        <span className="rtp-readout__colon">:</span>
        <button
          className={`rtp-readout__seg ${mode === 'MINUTES' ? 'rtp-readout__seg--active' : ''}`}
          onClick={() => setMode('MINUTES')}
        >
          {readoutM}
        </button>
        <span className="rtp-readout__label t-label">
          {mode === 'HOURS' ? 'HRS' : 'MIN'}
        </span>
      </div>

      {/* ── Clock Face ──────────────────────────────────────────────────── */}
      <div className="rtp-dial-wrap">
        <svg
          ref={svgRef}
          className="rtp-dial"
          viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ cursor: dragging ? 'crosshair' : 'pointer', touchAction: 'none' }}
        >
          {/* Outer track ring */}
          <circle
            cx={CENTER} cy={CENTER}
            r={OUTER_R}
            className="rtp-track"
          />
          {/* Inner track ring (hours only) */}
          {mode === 'HOURS' && (
            <circle
              cx={CENTER} cy={CENTER}
              r={INNER_R}
              className="rtp-track rtp-track--inner"
            />
          )}

          {/* Center pivot dot */}
          <circle cx={CENTER} cy={CENTER} r={3} className="rtp-pivot" />

          {/* Hand line */}
          <line
            x1={CENTER} y1={CENTER}
            x2={handMid.x} y2={handMid.y}
            className="rtp-hand"
          />

          {/* Accent dot at tip */}
          <circle
            cx={handTip.x} cy={handTip.y}
            r={DOT_R}
            className="rtp-hand-dot"
          />

          {/* Clock numbers */}
          {clockNumbers.map((n) => {
            const isSelected = mode === 'HOURS'
              ? n.value === hours
              : n.value === Math.round(minutes / 5) * 5 % 60;
            return (
              <text
                key={`${n.ring}-${n.value}`}
                x={n.x}
                y={n.y}
                className={`rtp-num ${n.ring === 'inner' ? 'rtp-num--inner' : ''} ${isSelected ? 'rtp-num--selected' : ''}`}
                dominantBaseline="central"
                textAnchor="middle"
              >
                {n.label}
              </text>
            );
          })}
        </svg>
      </div>

      {/* ── Footer Actions ───────────────────────────────────────────────── */}
      <div className="rtp-actions">
        <button className="rtp-btn rtp-btn--cancel" onClick={onClose}>
          CANCEL
        </button>
        <button className="rtp-btn rtp-btn--confirm" onClick={handleConfirm}>
          SET TIME
        </button>
      </div>
    </div>
  );
}
