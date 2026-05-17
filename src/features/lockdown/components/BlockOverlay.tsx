// ─── Block Overlay ───────────────────────────────────────────────
// Rendered inside the transparent `block-overlay` Tauri window.
// Displays a frosted glass ACCESS DENIED screen over banned apps.

import { useState, useEffect } from "react";
import { Shield } from "lucide-react";
import "./BlockOverlay.css";

interface BlockInfo {
  app_title: string;
  matched_rule: string;
}

export function BlockOverlay() {
  const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function setup() {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        unlisten = await listen<BlockInfo>("lockdown-block", (event) => {
          setBlockInfo({
            app_title: event.payload.app_title,
            matched_rule: event.payload.matched_rule,
          });
        });
      } catch {
        // Not in Tauri
      }
    }

    setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className="block-overlay">
      <div className="block-overlay__content">
        <Shield size={48} className="block-overlay__icon" />
        <h1 className="block-overlay__title">[ ACCESS DENIED ]</h1>
        <p className="block-overlay__subtitle">FOCUS PROTOCOL ACTIVE</p>
        {blockInfo && (
          <div className="block-overlay__app-name">
            {blockInfo.matched_rule.toUpperCase().replace(".EXE", "")}
          </div>
        )}
        <p className="block-overlay__hint">
          RETURN TO COMMAND CENTER TO END LOCKDOWN
        </p>
      </div>
    </div>
  );
}
