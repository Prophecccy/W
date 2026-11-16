import React, { useEffect, useState, useCallback } from "react";
import { LayoutDashboard, AppWindow, StickyNote, Power } from "lucide-react";
import { isTauri } from "../../../shared/utils/tauri";
import { useSpotlightBorder } from "../../../shared/hooks/useSpotlightBorder";
import { playMechanicalClick, playSubtleThud } from "../../../shared/services/tactileAudioService";
import "./TrayMenuPage.css";

interface TrayState {
  widget_visible: boolean;
  sticky_visible: boolean;
  version: string;
}

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<T>(cmd, args);
    } catch (e) {
      console.error(`safeInvoke failed for ${cmd}:`, e);
    }
  }
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  pill?: string;
  pillVariant?: "active" | "hidden" | "neutral" | "danger";
  isDanger?: boolean;
  onClick: () => void;
}

function MenuItem({ icon, label, pill, pillVariant = "neutral", isDanger = false, onClick }: MenuItemProps) {
  const spotlight = useSpotlightBorder<HTMLButtonElement>();

  return (
    <button
      type="button"
      className={`tray-menu-item ${isDanger ? "tray-menu-item--danger" : ""}`}
      onClick={onClick}
      onPointerEnter={spotlight.onPointerEnter}
      onPointerMove={spotlight.onPointerMove}
      onPointerLeave={spotlight.onPointerLeave}
    >
      <div className="tray-item-left">
        <span className="tray-item-icon">{icon}</span>
        <span className="tray-item-label">{label}</span>
      </div>
      {pill && (
        <span className={`tray-item-pill tray-item-pill--${pillVariant}`}>
          {pill}
        </span>
      )}
    </button>
  );
}

export function TrayMenuPage() {
  const [trayState, setTrayState] = useState<TrayState>({
    widget_visible: false,
    sticky_visible: false,
    version: "1.8.5",
  });

  const fetchStatus = useCallback(async () => {
    const res = await safeInvoke<TrayState>("get_tray_state");
    if (res) {
      setTrayState(res);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Re-check state whenever this window gains focus
    const handleFocus = () => {
      fetchStatus();
    };

    // Close on Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        playSubtleThud();
        safeInvoke("tray_hide_menu");
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fetchStatus]);

  const handleShowMain = () => {
    playMechanicalClick();
    safeInvoke("tray_show_main");
  };

  const handleToggleWidget = async () => {
    playMechanicalClick();
    const newVisible = !trayState.widget_visible;
    setTrayState(prev => ({ ...prev, widget_visible: newVisible }));
    await safeInvoke("tray_toggle_widget");
  };

  const handleToggleSticky = async () => {
    playMechanicalClick();
    const newVisible = !trayState.sticky_visible;
    setTrayState(prev => ({ ...prev, sticky_visible: newVisible }));
    await safeInvoke("tray_toggle_sticky");
  };

  const handleQuit = () => {
    playSubtleThud();
    safeInvoke("tray_quit_app");
  };

  return (
    <div className="tray-menu-wrapper">
      <div className="tray-menu-chassis">
        {/* Top Accent Rail */}
        <div className="tray-menu-rail" />

        {/* Clean Header */}
        <div className="tray-menu-header">
          <span className="tray-menu-title">W</span>
          <span className="tray-menu-version">v{trayState.version}</span>
        </div>

        {/* Action Buttons */}
        <div className="tray-menu-body">
          <MenuItem
            icon={<LayoutDashboard size={15} />}
            label="Command Center"
            onClick={handleShowMain}
          />

          <MenuItem
            icon={<AppWindow size={15} />}
            label="Desktop Widget"
            pill={trayState.widget_visible ? "Visible" : "Hidden"}
            pillVariant={trayState.widget_visible ? "active" : "hidden"}
            onClick={handleToggleWidget}
          />

          <MenuItem
            icon={<StickyNote size={15} />}
            label="Sticky Notes"
            pill={trayState.sticky_visible ? "Visible" : "Hidden"}
            pillVariant={trayState.sticky_visible ? "active" : "hidden"}
            onClick={handleToggleSticky}
          />

          <div className="tray-menu-separator" />

          <MenuItem
            icon={<Power size={15} />}
            label="Quit W"
            isDanger={true}
            onClick={handleQuit}
          />
        </div>
      </div>
    </div>
  );
}
