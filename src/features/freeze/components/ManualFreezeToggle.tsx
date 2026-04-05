import { useState, useEffect } from "react";
import { Snowflake, Play, Pause } from "lucide-react";
import {
  getFreezeState,
  activateFreeze,
  deactivateFreeze,
} from "../services/freezeService";
import { FreezeState } from "../types";
import "./ManualFreezeToggle.css";

export function ManualFreezeToggle() {
  const [freeze, setFreeze] = useState<FreezeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    loadFreezeState();
  }, []);

  async function loadFreezeState() {
    try {
      const state = await getFreezeState();
      setFreeze(state);
    } catch {
      // If freeze state doesn't exist yet, treat as inactive
      setFreeze(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      if (freeze?.active) {
        await deactivateFreeze();
      } else {
        await activateFreeze("manual");
      }
      await loadFreezeState();
    } catch (err) {
      console.error("Failed to toggle freeze:", err);
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="freeze-toggle">
        <span className="t-meta">LOADING FREEZE STATE...</span>
      </div>
    );
  }

  const isActive = freeze?.active ?? false;
  const frozenDays = isActive && freeze?.startDate
    ? calculateDaysSince(freeze.startDate)
    : 0;

  return (
    <div className="freeze-toggle">
      <div className="freeze-toggle__header">
        <Snowflake size={14} strokeWidth={1.5} />
        <span className="t-label">[ HABIT FREEZE ]</span>
      </div>

      <div className="freeze-toggle__body">
        <div className="freeze-toggle__info">
          <p className="t-body">
            {isActive
              ? "Habits are currently frozen. No strikes will accrue."
              : "Pause all habits temporarily. No penalties while frozen."}
          </p>
          {isActive && freeze?.startDate && (
            <p className="t-meta freeze-toggle__since">
              FROZEN SINCE {formatDisplayDate(freeze.startDate)} — {frozenDays} DAY{frozenDays !== 1 ? "S" : ""}
            </p>
          )}
        </div>

        <button
          className={`freeze-toggle__btn ${isActive ? "freeze-toggle__btn--active" : ""}`}
          onClick={handleToggle}
          disabled={toggling}
        >
          {isActive ? (
            <>
              <Play size={12} strokeWidth={2} />
              <span>{toggling ? "..." : "[ END FREEZE ]"}</span>
            </>
          ) : (
            <>
              <Pause size={12} strokeWidth={2} />
              <span>{toggling ? "..." : "[ ACTIVATE FREEZE ]"}</span>
            </>
          )}
        </button>
      </div>

      {/* Freeze history count */}
      {freeze && freeze.history.length > 0 && (
        <p className="t-meta freeze-toggle__history">
          {freeze.history.length} PREVIOUS FREEZE{freeze.history.length !== 1 ? "S" : ""}
        </p>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function calculateDaysSince(startDate: string): number {
  const s = new Date(startDate + "T12:00:00");
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.max(1, Math.round((now.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}
