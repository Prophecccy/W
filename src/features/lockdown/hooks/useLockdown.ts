// ─── useLockdown Hook ────────────────────────────────────────────
// Listens for `lockdown-violation` events from Rust, issues strikes,
// manages countdown timer, and tracks active lockdown state.

import { useState, useEffect, useCallback, useRef } from "react";
import { addStrike } from "../../strikes/services/strikeService";
import {
  getLockdownState,
  activateLockdown,
  deactivateLockdown,
  recordViolation,
  resumeLockdownIfActive,
} from "../services/lockdownService";
import { LockdownState, DEFAULT_LOCKDOWN_STATE } from "../types";

interface UseLockdownReturn {
  state: LockdownState;
  isActive: boolean;
  timeRemaining: number | null; // seconds remaining, null if no timer
  violation: ViolationFlash | null;
  activate: (blocklist: string[], duration: number | null) => Promise<void>;
  deactivate: () => Promise<void>;
  reload: () => Promise<void>;
}

interface ViolationFlash {
  appTitle: string;
  matchedRule: string;
  timestamp: number;
}

export function useLockdown(): UseLockdownReturn {
  const [state, setState] = useState<LockdownState>({ ...DEFAULT_LOCKDOWN_STATE });
  const [violation, setViolation] = useState<ViolationFlash | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const violationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load state on mount ────────────────────────────────────────
  const reload = useCallback(async () => {
    try {
      const lockdownState = await getLockdownState();
      setState(lockdownState);
    } catch {
      // User doc may not exist yet
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Resume lockdown if it was active before app restart ────────
  useEffect(() => {
    resumeLockdownIfActive().then((resumed) => {
      if (resumed) reload();
    });
  }, [reload]);

  // ── Listen for violation events from Rust ──────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function setupListener() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<{ app_title: string; matched_rule: string }>(
          "lockdown-violation",
          async (event) => {
            const { app_title, matched_rule } = event.payload;

            // 1. Record violation in Firestore
            await recordViolation(app_title, matched_rule);

            // 2. Issue a strike
            try {
              await addStrike(
                "lockdown",
                `Lockdown: ${matched_rule}`,
                "lockdown_violation" as any
              );
            } catch (err) {
              console.error("Failed to issue lockdown strike:", err);
            }

            // 3. Flash violation overlay
            setViolation({
              appTitle: app_title,
              matchedRule: matched_rule,
              timestamp: Date.now(),
            });

            // Clear violation after 4 seconds
            if (violationTimeoutRef.current) {
              clearTimeout(violationTimeoutRef.current);
            }
            violationTimeoutRef.current = setTimeout(() => {
              setViolation(null);
            }, 4000);

            // 4. Send native notification
            try {
              const { sendNotification } = await import(
                "../../../shared/services/notificationService"
              );
              sendNotification(
                "🔒 LOCKDOWN VIOLATION",
                `${matched_rule} detected — +1 STRIKE ISSUED`
              );
            } catch {
              // Notifications may not be available
            }

            // 5. Reload state to reflect new violation count
            reload();
          }
        );
      } catch {
        // Not in Tauri
      }
    }

    setupListener();
    return () => {
      if (unlisten) unlisten();
      if (violationTimeoutRef.current) clearTimeout(violationTimeoutRef.current);
    };
  }, [reload]);

  // ── Countdown timer ────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!state.active || !state.duration || !state.startedAt) {
      setTimeRemaining(null);
      return;
    }

    const endTime = state.startedAt + state.duration * 60 * 1000;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        // Auto-deactivate
        deactivateLockdownHandler();
      }
    };

    tick(); // Initial
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.active, state.duration, state.startedAt]);

  // ── Actions ────────────────────────────────────────────────────
  const activateHandler = useCallback(
    async (blocklist: string[], duration: number | null) => {
      await activateLockdown(blocklist, duration);
      await reload();
    },
    [reload]
  );

  const deactivateLockdownHandler = useCallback(async () => {
    await deactivateLockdown();
    setTimeRemaining(null);
    await reload();
  }, [reload]);

  return {
    state,
    isActive: state.active,
    timeRemaining,
    violation,
    activate: activateHandler,
    deactivate: deactivateLockdownHandler,
    reload,
  };
}
