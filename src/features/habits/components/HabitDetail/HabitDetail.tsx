import { useState, useEffect, useMemo } from "react";
import { Habit, HabitLog } from "../../types";
import { getLogRange } from "../../services/logService";
import { getToday, subtractDays } from "../../../../shared/utils/dateUtils";
import { LucideIcon } from "../../../../shared/components/IconPicker/LucideIcon";
import { useToast } from "../../../../shared/components/Toast/Toast";
import { updateHabit, archiveHabit } from "../../services/habitService";
import "./HabitDetail.css";

interface HabitDetailProps {
  habit: Habit;
  onClose: () => void;
  onUpdate: (updated: Habit) => void;
  onDeleteRequest: (habit: Habit) => void;
}

export function HabitDetail({ habit, onClose, onUpdate, onDeleteRequest }: HabitDetailProps) {
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const { showToast } = useToast();

  // Edit states
  const [title, setTitle] = useState(habit.title);
  const [desc, setDesc] = useState(habit.description);
  const [isSaving, setIsSaving] = useState(false);

  const today = getToday();
  const past28Days = subtractDays(today, 27);

  useEffect(() => {
    async function loadLogs() {
      try {
        const data = await getLogRange(past28Days, today);
        setLogs(data);
      } catch (err) {
        console.error("Failed to load habit details", err);
      }
    }
    loadLogs();
  }, [habit.id, today, past28Days]);

  // Generate trailing 28 days layout for Heatmap (7 days x 4 weeks)
  const heatmapCells = useMemo(() => {
    const cells = [];
    for (let i = 27; i >= 0; i--) {
      const d = subtractDays(today, i);
      const dayLog = logs.find((l) => l.date === d);
      const isCompleted = dayLog?.habits[habit.id]?.completed || false;
      cells.push({ date: d, isCompleted });
    }
    return cells;
  }, [logs, habit.id, today]);

  // Generate path data for SVG sparkline (last 14 days)
  const sparklineData = useMemo(() => {
    if (habit.type === "standard") return null;
    const points = [];
    for (let i = 13; i >= 0; i--) {
      const d = subtractDays(today, i);
      const dayLog = logs.find((l) => l.date === d);
      const val = dayLog?.habits[habit.id]?.value || 0;
      points.push(val);
    }
    
    const max = Math.max(...points, habit.metric?.targetValue || 1);
    const min = 0; // Or Math.min(...points)
    const range = max - min || 1;
    
    // Normalize to 0-100 height, 0-200 width
    const svgPoints = points.map((p, index) => {
      const x = (index / 13) * 200;
      const y = 50 - ((p - min) / range) * 50; // invert Y for SVG (top is 0)
      return `${x},${y}`;
    });
    
    return { points, polyline: svgPoints.join(" "), max };
  }, [logs, habit.id, today, habit]);

  async function handleSave() {
    setIsSaving(true);
    try {
      const updated = { ...habit, title, description: desc };
      // Wait, habitService doesn't have updateHabit yet!
      // I will need to add it, or just use the generic update. I'll add updateHabit.
      await updateHabit(habit.id, updated);
      onUpdate(updated);
      showToast("[ HABIT UPDATED ]");
    } catch {
      showToast("[ FAILED TO SAVE ]");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive() {
    if (!confirm("Soft-delete (Archive) this habit? It won't appear, but data remains.")) return;
    try {
      setIsSaving(true);
      await archiveHabit(habit.id);
      showToast("[ ARCHIVED ]");
      onClose();
    } catch {
      showToast("[ FAILED TO ARCHIVE ]");
      setIsSaving(false);
    }
  }

  return (
    <div className="habit-detail-overlay" onClick={onClose}>
      <div className="habit-detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="habit-detail__header">
          <h2 className="t-h2">[ {habit.title.toUpperCase()} ]</h2>
          <button className="habit-detail__close" onClick={onClose}>
            <LucideIcon name="X" size={24} />
          </button>
        </div>

        <div className="habit-detail__content">
          {/* Analytics Section */}
          <section className="habit-detail__section">
            <h3 className="t-label" style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>[ ANALYTICS ]</h3>
            
            <div className="habit-detail__stats-grid">
              <div className="habit-detail__stat-box">
                <span className="t-meta">LEVEL</span>
                <span className="t-display">{habit.level}</span>
              </div>
              <div className="habit-detail__stat-box">
                <span className="t-meta">STREAK</span>
                <span className="t-display">{habit.currentStreak}</span>
              </div>
              <div className="habit-detail__stat-box">
                <span className="t-meta">TOTAL</span>
                <span className="t-display">{habit.totalCompletions}</span>
              </div>
            </div>

            <div className="habit-detail__heatmap-container">
              <span className="t-meta">LAST 28 DAYS</span>
              <div className="habit-detail__heatmap">
                {heatmapCells.map((c) => (
                  <div
                    key={c.date}
                    className={`heatmap-cell ${c.isCompleted ? "completed" : ""}`}
                    style={{ backgroundColor: c.isCompleted ? habit.color : "transparent" }}
                    title={`${c.date}: ${c.isCompleted ? "Completed" : "Missed"}`}
                  />
                ))}
              </div>
            </div>

            {sparklineData && (
              <div className="habit-detail__chart-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="t-meta">LAST 14 DAYS TREND</span>
                  <span className="t-meta" style={{ color: habit.type === 'limiter' ? 'var(--strike-red)' : habit.color }}>MAX: {sparklineData.max}</span>
                </div>
                <svg viewBox="0 0 200 50" className="habit-detail__sparkline">
                  {habit.type === 'limiter' && habit.metric?.targetValue && (
                    <line 
                      x1="0" 
                      y1={50 - ((habit.metric.targetValue) / Math.max(sparklineData.max, 1)) * 50} 
                      x2="200" 
                      y2={50 - ((habit.metric.targetValue) / Math.max(sparklineData.max, 1)) * 50} 
                      stroke="var(--strike-red)" 
                      strokeDasharray="4 4"
                      strokeWidth="1" 
                    />
                  )}
                  <polyline
                    points={sparklineData.polyline}
                    fill="none"
                    stroke={habit.type === 'limiter' ? 'var(--text-secondary)' : habit.color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Target line for metrics */}
                  {habit.type === 'metric' && habit.metric?.targetValue && (
                    <line 
                      x1="0" y1={50 - ((habit.metric.targetValue) / sparklineData.max) * 50} 
                      x2="200" y2={50 - ((habit.metric.targetValue) / sparklineData.max) * 50} 
                      stroke="var(--border-hover)" 
                      strokeDasharray="2 2"
                      strokeWidth="1" 
                    />
                  )}
                </svg>
              </div>
            )}
          </section>

          {/* Configuration Section */}
          <section className="habit-detail__section">
            <h3 className="t-label" style={{ color: "var(--text-secondary)", marginBottom: "16px" }}>[ CONFIGURATION ]</h3>
            
            <div className="habit-detail__form">
              <div className="form-group">
                <label className="t-meta">NAME</label>
                <input 
                  type="text" 
                  className="t-body" 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label className="t-meta">DESCRIPTION</label>
                <textarea 
                  className="t-body" 
                  value={desc} 
                  onChange={(e) => setDesc(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="habit-detail__locked-props">
                <div className="locked-prop">
                  <LucideIcon name="Lock" size={12} />
                  <span className="t-meta">PERIOD: {habit.period.toUpperCase()}</span>
                </div>
                <div className="locked-prop">
                  <LucideIcon name="Lock" size={12} />
                  <span className="t-meta">TYPE: {habit.type.toUpperCase()}</span>
                </div>
                {habit.metric && (
                  <div className="locked-prop">
                    <LucideIcon name="Lock" size={12} />
                    <span className="t-meta">TARGET: {habit.metric.targetValue} {habit.metric.unit.toUpperCase()}</span>
                  </div>
                )}
              </div>

              <div className="habit-detail__actions">
                <button 
                  className="btn-save t-label" 
                  onClick={handleSave} 
                  disabled={isSaving || (title === habit.title && desc === habit.description)}
                  style={{ color: title !== habit.title || desc !== habit.description ? habit.color : 'inherit' }}
                >
                  {isSaving ? "SAVING..." : "[ SAVE EDITS ]"}
                </button>
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="habit-detail__section danger-zone">
             <div className="habit-detail__actions-row">
               <button className="t-label btn-archive" onClick={handleArchive}>
                 [ ARCHIVE HABIT ]
               </button>
               <button className="t-label btn-delete" onClick={() => onDeleteRequest(habit)}>
                 [ DELETE ]
               </button>
             </div>
          </section>
        </div>
      </div>
    </div>
  );
}
