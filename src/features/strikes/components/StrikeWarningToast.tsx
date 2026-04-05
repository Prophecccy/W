import { useEffect, useRef } from "react";
import { useToast } from "../../../shared/components/Toast/Toast";
import { StrikeState, MAX_STRIKES } from "../types";

interface StrikeWarningToastProps {
  strikes: StrikeState;
}

/**
 * Watches strike count and shows a warning toast at 3/5 and 4/5.
 * Renders nothing — purely side-effect driven.
 */
export function StrikeWarningToast({ strikes }: StrikeWarningToastProps) {
  const { showToast } = useToast();
  const prevCountRef = useRef(strikes.current);

  useEffect(() => {
    const prev = prevCountRef.current;
    const curr = strikes.current;
    prevCountRef.current = curr;

    // Only warn on increment, not on initial mount or decrement (reset)
    if (curr > prev && (curr === 3 || curr === 4)) {
      showToast(`⚠️ ${curr}/${MAX_STRIKES} STRIKES — Lockout at ${MAX_STRIKES}`);
    }
  }, [strikes.current, showToast]);

  return null;
}
