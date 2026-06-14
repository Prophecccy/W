// ─── useLockdown Hook ────────────────────────────────────────────
// Listens for `lockdown-block` / `lockdown-unblock` events from Rust.
// Positions the block-overlay Tauri window over banned apps.
// NO strikes, NO notifications — purely a visual/physical block.

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuthContext } from "../../auth/context";
import {
  getLockdownState,
  activateLockdown,
  deactivateLockdown,
  resumeLockdownIfActive,
} from "../services/lockdownService";
import { LockdownState, DEFAULT_LOCKDOWN_STATE } from "../types";
import { isTauri } from "../../../shared/utils/tauri";

interface UseLockdownReturn {
  state: LockdownState;
  isActive: boolean;
  timeRemaining: number | null;
  activate: (blocklist: string[], duration: number | null) => Promise<void>;
  deactivate: () => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
}

export function useLockdown(): UseLockdownReturn {
  const { user } = useAuthContext();
  const [state, setState] = useState<LockdownState>({ ...DEFAULT_LOCKDOWN_STATE });
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Load state on mount ────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!user) return;
    try {
      const lockdownState = await getLockdownState(user.uid);
      if (isMountedRef.current) {
        setState(lockdownState);
        setLoading(false);
      }
    } catch {
      // User doc may not exist yet
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [user]);

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

    // Hide the block overlay when lockdown is deactivated
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const overlay = await WebviewWindow.getByLabel("block-overlay");
      if (overlay) {
        await overlay.hide();
      }
    } catch {
      // Not in Tauri
    }

    await reload();
  }, [reload]);

  useEffect(() => {
    if (user) {
      reload();
    }
  }, [user, reload]);

  // ── Resume lockdown if it was active before app restart ────────
  useEffect(() => {
    if (user) {
      resumeLockdownIfActive(user.uid).then((resumed) => {
        if (resumed && isMountedRef.current) reload();
      });
    }
  }, [user, reload]);

  // ── Listen for block/unblock events from Rust ─────────────────
  useEffect(() => {
    let active = true;
    const cleanups: (() => void)[] = [];

    async function setupListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

        if (!active) return;
        console.log("[lockdown] Setting up block/unblock/expired listeners...");

        // Helper: get the statically defined block-overlay window
        async function getOrCreateOverlay(): Promise<InstanceType<typeof WebviewWindow> | null> {
          return await WebviewWindow.getByLabel("block-overlay");
        }

        // ── BLOCK: position overlay over the banned window ───────
        const unsubBlock = await listen<{
          app_title: string;
          matched_rule: string;
          pid: number;
          x: number;
          y: number;
          width: number;
          height: number;
        }>("lockdown-block", async (event) => {
          if (!active) return;
          const { x, y, width, height } = event.payload;
          
          try {
            console.log("[lockdown] Received block event:", event.payload);
            const overlay = await getOrCreateOverlay();
            if (!overlay) {
              console.error("[lockdown] Failed to get/create overlay");
              return;
            }

            const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");

            // Use physical pixels directly from the OS
            const safeW = Math.max(200, width);
            const safeH = Math.max(100, height);

            await overlay.setPosition(new PhysicalPosition(x, y));
            await overlay.setSize(new PhysicalSize(safeW, safeH));
            await overlay.show();
            await overlay.setFocus();
            console.log("[lockdown] Overlay positioned and shown.");
          } catch (err: any) {
            console.error("[lockdown] Failed to position block overlay:", err);
          }
        });
        cleanups.push(unsubBlock);

        // ── UNBLOCK: hide the overlay ───────────────────────────
        const unsubUnblock = await listen("lockdown-unblock", async () => {
          if (!active) return;
          try {
            const overlay = await WebviewWindow.getByLabel("block-overlay");
            if (overlay) {
              await overlay.hide();
            }
          } catch (err) {
            console.error("[lockdown] Failed to hide block overlay:", err);
          }
        });
        cleanups.push(unsubUnblock);

        // ── EXPIRED: handle lockdown timer expiration in Rust ───
        const unsubExpired = await listen("lockdown-expired", async () => {
          if (!active) return;
          console.log("[lockdown] Received expired event from Rust. Deactivating.");
          await deactivateLockdownHandler();
        });
        cleanups.push(unsubExpired);

        if (!active) {
          cleanups.forEach((unsub) => unsub());
        } else {
          console.log("[lockdown] Block/unblock/expired listeners registered");
        }
      } catch (err) {
        console.error("[lockdown] Failed to setup listeners:", err);
      }
    }

    setupListeners();
    return () => {
      active = false;
      cleanups.forEach((unsub) => unsub());
    };
  }, [deactivateLockdownHandler]);
  // ── Countdown timer ────────────────────────────────────────────
  const remainingSecondsRef = useRef<number | null | undefined>(undefined);
  const currentRemainingRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const lastSaveRef = useRef<number>(Date.now());

  useEffect(() => {
    remainingSecondsRef.current = state.remainingSeconds;
  }, [state.remainingSeconds]);

  // ── Countdown timer ────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!state.active || !state.duration) {
      setTimeRemaining(null);
      return;
    }

    // Initialize once on mount/lockdown-activation
    const initialSecs = remainingSecondsRef.current ?? state.remainingSeconds ?? (state.duration * 60);
    setTimeRemaining(initialSecs);
    currentRemainingRef.current = initialSecs;
    
    lastTickRef.current = Date.now();
    lastSaveRef.current = Date.now();

    const tick = async () => {
      const now = Date.now();
      const diff = now - lastTickRef.current;
      lastTickRef.current = now;

      if (currentRemainingRef.current === null) return;

      // Clock tampering detection (jump backward or positive jump > 30s while tab is visible)
      // We increase the threshold from 10s to 30s to allow for browser/system stutters without false penalties.
      const isNegativeJump = diff < -30000;
      const isPositiveJump = diff > 30000;
      // Jumps greater than 32s are treated as system sleep/suspension
      const isSleepOrSuspension = diff > 32000;
      
      const isTampering = isNegativeJump || (isPositiveJump && !isSleepOrSuspension && !document.hidden);

      if (isTampering) {
        console.warn("[lockdown] System clock tampering detected!", diff);
        const penaltySecs = 15 * 60;
        const newSecs = currentRemainingRef.current + penaltySecs;
        currentRemainingRef.current = newSecs;
        setTimeRemaining(newSecs);
        
        window.dispatchEvent(
          new CustomEvent("w:toast", {
            detail: "⚠️ CLOCK TAMPERING DETECTED: +15 MIN PENANCE APPLIED."
          })
        );
        
        if (user) {
          const { doc, updateDoc } = await import("firebase/firestore");
          const { db } = await import("../../../shared/config/firebase");
          await updateDoc(doc(db, "users", user.uid), {
            "lockdown.remainingSeconds": newSecs,
            "lockdown.startedAt": now,
          }).catch(console.error);
        }

        try {
          const { invoke } = await import("@tauri-apps/api/core");
          invoke("update_lockdown_remaining", { remainingSecs: newSecs }).catch(console.error);
        } catch {}

        return;
      }

      // Calculate elapsed seconds based on diff
      let elapsedSecs = 1;
      if (isSleepOrSuspension || document.hidden) {
        elapsedSecs = Math.round(diff / 1000);
      }

      const newSecs = Math.max(0, currentRemainingRef.current - elapsedSecs);
      currentRemainingRef.current = newSecs;
      setTimeRemaining(newSecs);

      if (newSecs <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (isTauri()) {
          console.log("[lockdown] Timer reached 0, but deferring deactivation to Rust.");
        } else {
          deactivateLockdownHandler();
        }
        return;
      }

      // Autosave check - runs every 10 seconds (including when hidden)
      if (now - lastSaveRef.current >= 10000 && user) {
        lastSaveRef.current = now;
        const { doc, updateDoc } = await import("firebase/firestore");
        const { db } = await import("../../../shared/config/firebase");
        updateDoc(doc(db, "users", user.uid), {
          "lockdown.remainingSeconds": newSecs,
        }).catch(console.error);
      }
    };

    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.active, state.duration, user, deactivateLockdownHandler]);

  return {
    state,
    isActive: state.active,
    timeRemaining,
    activate: activateHandler,
    deactivate: deactivateLockdownHandler,
    reload,
    loading,
  };
}
