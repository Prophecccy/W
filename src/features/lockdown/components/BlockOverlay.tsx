// ─── Block Overlay ───────────────────────────────────────────────
// Rendered inside the transparent `block-overlay` Tauri window.
// Displays an ACCESS DENIED screen over banned apps with a Close
// button that kills the banned process and dismisses the overlay.

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { LockdownLogo } from "./LockdownLogo";
import "./BlockOverlay.css";

interface BlockInfo {
  app_title: string;
  matched_rule: string;
  pid: number;
}

export function BlockOverlay() {
  const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubPromise: Promise<() => void> | null = null;

    async function setup() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (!active) return () => {};

        const unsub = await listen<BlockInfo>("lockdown-block", (event) => {
          if (!active) return;
          setBlockInfo({
            app_title: event.payload.app_title,
            matched_rule: event.payload.matched_rule,
            pid: event.payload.pid,
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
    setClosing(true);

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { getCurrentWindow } = await import("@tauri-apps/api/window");

      // 1. Kill the banned process
      if (targetPid > 0) {
        await invoke("kill_blocked_process", { pid: targetPid });
        console.log("[lockdown] Killed process:", targetPid);
      }

      // 2. Hide this overlay window
      const win = getCurrentWindow();
      await win.hide();

      // 3. Clear state only if no other block event has occurred in the meantime
      setBlockInfo((prev) => (prev && prev.pid === targetPid ? null : prev));
      setClosing(false);
    } catch (err) {
      console.error("[lockdown] Close handler error:", err);
      setClosing(false);
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
          {closing ? "CLOSING..." : "CLOSE APP"}
        </button>
      </div>
    </div>
  );
}
