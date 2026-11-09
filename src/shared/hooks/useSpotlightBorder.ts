import { useRef, useCallback } from "react";

/**
 * Tactical Cursor-Tracking Spotlight Hook.
 * Dynamically projects mouse coordinates (--mouse-x, --mouse-y) onto the element's style
 * using requestAnimationFrame to prevent layout thrashing and maintain 120 FPS.
 */
export function useSpotlightBorder<T extends HTMLElement = HTMLDivElement>() {
  const rectRef = useRef<DOMRect | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const handlePointerEnter = useCallback((e: React.PointerEvent<T>) => {
    rectRef.current = e.currentTarget.getBoundingClientRect();
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<T>) => {
    const target = e.currentTarget;
    if (!rectRef.current) {
      rectRef.current = target.getBoundingClientRect();
    }
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      if (!rectRef.current) return;
      const x = clientX - rectRef.current.left;
      const y = clientY - rectRef.current.top;
      target.style.setProperty("--mouse-x", `${Math.round(x)}px`);
      target.style.setProperty("--mouse-y", `${Math.round(y)}px`);
    });
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent<T>) => {
    rectRef.current = null;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    e.currentTarget.style.removeProperty("--mouse-x");
    e.currentTarget.style.removeProperty("--mouse-y");
  }, []);

  return {
    onPointerEnter: handlePointerEnter,
    onPointerMove: handlePointerMove,
    onPointerLeave: handlePointerLeave,
  };
}
