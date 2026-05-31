import { useState, useEffect } from "react";
import { Snowflake, Play, Calendar, ArrowRight, X, Minus } from "lucide-react";
import { isTauri } from "../../../shared/utils/tauri";
import { deactivateFreeze } from "../services/freezeService";
import "./WelcomeBack.css";

interface WelcomeBackProps {
  frozenSince: string;
  today: string;
  onResume: () => void;
}

export function WelcomeBack({ frozenSince, today, onResume }: WelcomeBackProps) {
  const [resuming, setResuming] = useState(false);
  const [appWindow, setAppWindow] = useState<any>(null);

  useEffect(() => {
    if (isTauri()) {
      import("@tauri-apps/api/webviewWindow").then(({ getCurrentWebviewWindow }) => {
        setAppWindow(getCurrentWebviewWindow());
      }).catch(console.error);
    }
  }, []);

  const frozenDays = calculateFrozenDays(frozenSince, today);

  const handleResume = async () => {
    setResuming(true);
    try {
      await deactivateFreeze();
      onResume();
    } catch (err) {
      console.error("Failed to deactivate freeze:", err);
      setResuming(false);
    }
  };

  const handleDrag = (e: React.MouseEvent) => {
    if (e.button === 0 && appWindow) { // Left click only
      appWindow.startDragging();
    }
  };

  return (
    <div className="welcome-back" data-tauri-drag-region onMouseDown={handleDrag}>
      <header className="welcome-back__header" data-tauri-drag-region onMouseDown={handleDrag}>
        <div 
          className="welcome-back__controls" 
          data-tauri-drag-region="false"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button 
            className="welcome-back__control-btn" 
            onClick={() => appWindow && appWindow.minimize()}
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button 
            className="welcome-back__control-btn welcome-back__control-btn--close" 
            onClick={() => appWindow && appWindow.close()}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div 
        className="welcome-back__container" 
        data-tauri-drag-region="false"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Frost icon */}
        <div className="welcome-back__icon-ring">
          <Snowflake size={40} strokeWidth={1.5} />
        </div>

        <h1 className="t-display welcome-back__title">[ WELCOME BACK ]</h1>
        <p className="t-body welcome-back__subtitle">
          Your habits were automatically paused while you were away.
          <br />
          No strikes were added during this time.
        </p>

        {/* Frozen range */}
        <div className="welcome-back__range">
          <div className="welcome-back__range-item">
            <Calendar size={14} strokeWidth={1.5} />
            <span className="t-data">{formatDisplayDate(frozenSince)}</span>
          </div>
          <ArrowRight size={14} className="welcome-back__range-arrow" />
          <div className="welcome-back__range-item">
            <Calendar size={14} strokeWidth={1.5} />
            <span className="t-data">{formatDisplayDate(today)}</span>
          </div>
        </div>

        <p className="t-meta welcome-back__days">
          {frozenDays} DAY{frozenDays !== 1 ? "S" : ""} FROZEN
        </p>

        {/* Resume button */}
        <button
          className="welcome-back__resume"
          onClick={handleResume}
          disabled={resuming}
        >
          <Play size={16} strokeWidth={2} />
          <span>{resuming ? "RESUMING..." : "[ RESUME ALL HABITS ]"}</span>
        </button>

        <p className="t-meta welcome-back__hint">
          ALL SCHEDULED HABITS WILL BE ACTIVE AGAIN
        </p>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function calculateFrozenDays(startDate: string, endDate: string): number {
  const s = new Date(startDate + "T12:00:00");
  const e = new Date(endDate + "T12:00:00");
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
