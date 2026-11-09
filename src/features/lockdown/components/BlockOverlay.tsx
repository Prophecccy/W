// ─── Block Overlay ───────────────────────────────────────────────
// Rendered inside the transparent `block-overlay` Tauri window.
// Displays an ACCESS DENIED screen over banned apps with a Close
// button that kills the banned process and dismisses the overlay.

import { useState, useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";
import { LockdownLogo } from "./LockdownLogo";
import "./BlockOverlay.css";

interface BlockInfo {
  app_title: string;
  matched_rule: string;
  pid: number;
  hwnd?: number;
  is_browser?: boolean;
}

export function BlockOverlay() {
  const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null);
  const [closing, setClosing] = useState(false);
  const lastCloseTimeRef = useRef<number>(0);

  useEffect(() => {
    let active = true;
    let unsubPromise: Promise<() => void> | null = null;

    async function setup() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (!active) return () => {};

        const unsub = await listen<BlockInfo>("lockdown-block", (event) => {
          if (!active) return;
          // Cooldown guard: suppress block events within 2500ms of closing a tab
          if (Date.now() - lastCloseTimeRef.current < 2500) {
            return;
          }
          setBlockInfo({
            app_title: event.payload.app_title,
            matched_rule: event.payload.matched_rule,
            pid: event.payload.pid,
            hwnd: event.payload.hwnd,
            is_browser: event.payload.is_browser,
          });
          setClosing(false);
        });
        return unsub;
      } catch {
        return () => {};
      }
    }

    unsubPromise = setup();
    return () => {
      active = false;
      if (unsubPromise) {
        unsubPromise.then((unsub) => unsub()).catch(() => {});
      }
    };
  }, []);

  const handleClose = useCallback(async () => {
    if (!blockInfo || closing) return;
    const targetPid = blockInfo.pid;
    const targetHwnd = blockInfo.hwnd;
    const isBrowser = blockInfo.is_browser;

    // Immediately disable button and stamp closure time
    setClosing(true);
    lastCloseTimeRef.current = Date.now();

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { getCurrentWindow } = await import("@tauri-apps/api/window");

      // 1. Hide this overlay window first so the underlying app or browser can receive focus
      const win = getCurrentWindow();
      await win.hide();

      // Clear local block info immediately
      setBlockInfo(null);

      // 2. Either close the specific browser tab or kill the desktop process
      if (isBrowser && targetHwnd) {
        await invoke("close_blocked_tab", { hwnd: targetHwnd, pid: targetPid });
        console.log("[lockdown] Closed blocked browser tab:", targetHwnd);
      } else if (targetPid > 0) {
        await invoke("kill_blocked_process", { pid: targetPid });
        console.log("[lockdown] Killed process:", targetPid);
      }
    } catch (err) {
      console.error("[lockdown] Close handler error:", err);
    } finally {
      setTimeout(() => {
        setClosing(false);
      }, 2000);
    }
  }, [blockInfo, closing]);

  return (
    <div className="block-overlay">
      <div className="block-overlay__content">
        <LockdownLogo isActive={true} size={80} className="block-overlay__icon" />
        <h1 className="block-overlay__title">[ ACCESS DENIED ]</h1>
        <p className="block-overlay__subtitle">FOCUS PROTOCOL ACTIVE</p>
        {blockInfo && (
          <div className="block-overlay__app-name">
            {blockInfo.matched_rule.toUpperCase().replace(".EXE", "")}
          </div>
        )}

        <button
          className="block-overlay__close-btn"
          onClick={handleClose}
          disabled={closing}
        >
          <X size={16} />
          {closing ? "CLOSING..." : blockInfo?.is_browser ? "CLOSE TAB" : "CLOSE APP"}
        </button>
      </div>
    </div>
  );
}
