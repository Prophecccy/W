import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { RadialTimePicker } from './RadialTimePicker';

interface TimeInputProps {
  value: string;
  onChange: (val: string) => void;
  id?: string;
}

interface PopoverPos {
  top: number;
  left: number;
}

const POPOVER_W = 268; // must match .rtp-overlay width in CSS
const POPOVER_H = 340; // approximate height — used for flip logic
const GAP       = 6;   // gap between trigger and popover

/**
 * Drop-in replacement for <input type="time">.
 * Renders a tactical button trigger that opens a RadialTimePicker as a
 * viewport-aware fixed-position portal — never clipped by parent overflow.
 */
export function TimeInput({ value, onChange, id }: TimeInputProps) {
  const [open, setOpen]       = useState(false);
  const [pos,  setPos]        = useState<PopoverPos | null>(null);
  const triggerRef            = useRef<HTMLButtonElement>(null);

  // ── Calculate popover position from trigger's viewport rect ─────────────
  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;

    // Prefer: open below the trigger, right-aligned to it
    let top  = rect.bottom + GAP;
    let left = rect.right - POPOVER_W;

    // Flip left if it would go off the left edge
    if (left < 8) left = rect.left;

    // Flip right if it would go off the right edge
    if (left + POPOVER_W > vw - 8) left = vw - POPOVER_W - 8;

    // Flip upward if not enough space below
    if (top + POPOVER_H > vh - 8) top = rect.top - POPOVER_H - GAP;

    setPos({ top, left });
  }, []);

  const handleOpen = () => {
    calcPos();
    setOpen(true);
  };

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    const handler = () => calcPos();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, calcPos]);

  const handleChange = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  const handleClose = () => setOpen(false);

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`rtp-trigger ${open ? 'rtp-trigger--open' : ''}`}
        onClick={handleOpen}
        aria-label={`Select time, current value: ${value}`}
      >
        {value || '--:--'}
      </button>

      {open && pos && createPortal(
        <div
          className="rtp-portal-popover"
          style={{ top: pos.top, left: pos.left }}
        >
          <RadialTimePicker
            value={value || '00:00'}
            onChange={handleChange}
            onClose={handleClose}
          />
        </div>,
        document.body
      )}
    </>
  );
}
