import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
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

const GAP = 6;

export function TimeInput({ value, onChange, id }: TimeInputProps) {
  const [open, setOpen]       = useState(false);
  const [pos,  setPos]        = useState<PopoverPos | null>(null);
  const triggerRef            = useRef<HTMLButtonElement>(null);
  const popoverRef            = useRef<HTMLDivElement>(null);

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;

    // Initial guess: below the trigger, right-aligned
    // We'll refine this in useLayoutEffect once we have the actual popover size
    let top  = rect.bottom + GAP;
    let left = rect.right - 268; // Default POPOVER_W

    if (left < 8) left = rect.left;
    if (left + 268 > vw - 8) left = vw - 268 - 8;
    if (top + 340 > vh - 8) top = rect.top - 340 - GAP;

    setPos({ top, left });
  }, []);

  const handleOpen = () => {
    calcPos();
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || !popoverRef.current) return;

    const popoverRect = popoverRef.current.getBoundingClientRect();
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = popoverRect.width;
    const ph = popoverRect.height;

    let { top, left } = pos || { top: 0, left: 0 };

    // 1. Right edge collision
    if (left + pw > vw - 8) {
      left = vw - pw - 8;
    }
    // 2. Left edge collision
    if (left < 8) {
      left = 8;
    }
    // 3. Bottom edge collision -> Flip to top
    if (top + ph > vh - 8) {
      top = triggerRect.top - ph - GAP;
    }

    setPos({ top, left });
  }, [open]);

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
        className={`rtp-trigger t-data ${open ? 'rtp-trigger--open' : ''}`}
        onClick={handleOpen}
        aria-label={`Select time, current value: ${value}`}
      >
        {value || '--:--'}
      </button>

      {open && pos && createPortal(
        <div
          ref={popoverRef}
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
