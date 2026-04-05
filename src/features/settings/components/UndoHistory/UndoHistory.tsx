import { useState, useEffect } from "react";
import { getHistory, undoAction, purgeOldEntries } from "../../services/undoService";
import { UndoAction } from "../../services/undoTypes";
import { useToast } from "../../../../shared/components/Toast/Toast";
import {
  CheckCircle,
  XCircle,
  PlusCircle,
  Trash2,
  AlertTriangle,
  RotateCcw,
  History,
} from "lucide-react";
import "./UndoHistory.css";

const ICON_MAP: Record<string, React.ReactNode> = {
  habit_complete: <CheckCircle size={14} strokeWidth={1.5} color="var(--accent)" />,
  habit_uncomplete: <XCircle size={14} strokeWidth={1.5} color="var(--text-muted)" />,
  todo_create: <PlusCircle size={14} strokeWidth={1.5} color="var(--accent)" />,
  todo_delete: <Trash2 size={14} strokeWidth={1.5} color="var(--strike-red)" />,
  todo_complete: <CheckCircle size={14} strokeWidth={1.5} color="var(--accent)" />,
  strike_added: <AlertTriangle size={14} strokeWidth={1.5} color="var(--strike-red)" />,
};

// Non-undoable action types
const NON_UNDOABLE = new Set(["strike_added"]);

export function UndoHistory() {
  const { showToast } = useToast();
  const [actions, setActions] = useState<UndoAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
    // Purge old entries on mount
    purgeOldEntries().catch(() => {});
  }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      const data = await getHistory(7);
      setActions(data);
    } catch (err) {
      console.error("Failed to load undo history:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUndo(actionId: string) {
    setUndoing(actionId);
    try {
      await undoAction(actionId);
      showToast("[ ACTION UNDONE ]");
      setActions((prev) => prev.filter((a) => a.id !== actionId));
    } catch (err: any) {
      showToast(`[ UNDO FAILED: ${err.message?.toUpperCase() || "UNKNOWN"} ]`);
    } finally {
      setUndoing(null);
    }
  }

  // Group actions by day
  const grouped = groupByDay(actions);

  return (
    <div className="settings-section" id="settings-undo">
      <h2 className="settings-section__header t-label">[ UNDO HISTORY ]</h2>

      <div className="settings-section__content">
        {loading ? (
          <p className="t-meta">LOADING HISTORY...</p>
        ) : actions.length === 0 ? (
          <div className="undo-empty">
            <History size={20} strokeWidth={1} color="var(--text-muted)" />
            <p className="t-meta">NO RECENT ACTIONS</p>
          </div>
        ) : (
          <div className="undo-timeline">
            {Object.entries(grouped).map(([dayLabel, dayActions]) => (
              <div key={dayLabel} className="undo-day">
                <div className="undo-day__header t-label">{dayLabel}</div>
                <div className="undo-day__entries">
                  {dayActions.map((action) => (
                    <div key={action.id} className="undo-entry">
                      <div className="undo-entry__icon">
                        {ICON_MAP[action.type] || <History size={14} />}
                      </div>
                      <div className="undo-entry__content">
                        <span className="t-body">{action.description}</span>
                        <span className="t-meta">{formatTime(action.timestamp)}</span>
                      </div>
                      {!NON_UNDOABLE.has(action.type) && (
                        <button
                          className="undo-entry__btn t-label"
                          onClick={() => handleUndo(action.id)}
                          disabled={undoing === action.id}
                        >
                          {undoing === action.id ? "..." : (
                            <>
                              <RotateCcw size={10} strokeWidth={2} />
                              <span>[ UNDO ]</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function groupByDay(actions: UndoAction[]): Record<string, UndoAction[]> {
  const groups: Record<string, UndoAction[]> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const action of actions) {
    const actionDate = new Date(action.timestamp);
    actionDate.setHours(0, 0, 0, 0);

    let label: string;
    if (actionDate.getTime() === today.getTime()) {
      label = "[ TODAY ]";
    } else if (actionDate.getTime() === yesterday.getTime()) {
      label = "[ YESTERDAY ]";
    } else {
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      label = `[ ${months[actionDate.getMonth()]} ${actionDate.getDate()} ]`;
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(action);
  }

  return groups;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}
