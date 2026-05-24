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
    let unlisten: (() => void) | undefined;

    async function setup() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (!active) return;

        const unsub = await listen<BlockInfo>("lockdown-block", (event) => {
          if (!active) return;
          setBlockInfo({
            app_title: event.payload.app_title,
            matched_rule: event.payload.matched_rule,
            pid: event.payload.pid,
          });
          setClosing(false);
        });

        if (!active) {
          unsub();
        } else {
          unlisten = unsub;
        }
      } catch {
        // Not in Tauri
      }
    }

    setup();
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, []);

  const handleClose = useCallback(async () => {
    if (!blockInfo || closing) return;
    setClosing(true);

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { getCurrentWindow } = await import("@tauri-apps/api/window");

      // 1. Kill the banned process
      if (blockInfo.pid > 0) {
        try {
          await invoke("kill_blocked_process", { pid: blockInfo.pid });
          console.log("[lockdown] Killed process:", blockInfo.pid);
        } catch (err) {
          console.error("[lockdown] Failed to kill process:", err);
        }
      }

      // 2. Hide this overlay window
      const win = getCurrentWindow();
      await win.hide();

      // 3. Clear state
      setBlockInfo(null);
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
