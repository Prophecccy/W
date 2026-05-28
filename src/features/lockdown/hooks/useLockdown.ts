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

interface UseLockdownReturn {
  state: LockdownState;
  isActive: boolean;
  timeRemaining: number | null;
  activate: (blocklist: string[], duration: number | null) => Promise<void>;
  deactivate: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useLockdown(): UseLockdownReturn {
  const { user } = useAuthContext();
  const [state, setState] = useState<LockdownState>({ ...DEFAULT_LOCKDOWN_STATE });
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load state on mount ────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!user) return;
    try {
      const lockdownState = await getLockdownState(user.uid);
      setState(lockdownState);
    } catch {
      // User doc may not exist yet
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      reload();
    }
  }, [user, reload]);

  // ── Resume lockdown if it was active before app restart ────────
  useEffect(() => {
    if (user) {
      resumeLockdownIfActive(user.uid).then((resumed) => {
        if (resumed) reload();
      });
    }
  }, [user, reload]);

  // ── Listen for block/unblock events from Rust ─────────────────
  useEffect(() => {
    let active = true;
    let unlistenBlock: (() => void) | undefined;
    let unlistenUnblock: (() => void) | undefined;

    async function setupListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

        if (!active) return;
        console.log("[lockdown] Setting up block/unblock listeners...");

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

        if (!active) {
          unsubBlock();
          unsubUnblock();
        } else {
          unlistenBlock = unsubBlock;
          unlistenUnblock = unsubUnblock;
          console.log("[lockdown] Block/unblock listeners registered");
        }
      } catch (err) {
        console.error("[lockdown] Failed to setup listeners:", err);
      }
    }

    setupListeners();
    return () => {
      active = false;
      if (unlistenBlock) unlistenBlock();
      if (unlistenUnblock) unlistenUnblock();
    };
  }, []);

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
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        deactivateLockdownHandler();
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.active, state.duration, state.startedAt, deactivateLockdownHandler]);

  return {
    state,
    isActive: state.active,
    timeRemaining,
    activate: activateHandler,
    deactivate: deactivateLockdownHandler,
    reload,
  };
}
