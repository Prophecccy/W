import { useState } from "react";
import { IconPicker } from "../../../../shared/components/IconPicker/IconPicker";
import { ColorPicker } from "../../../../shared/components/ColorPicker/ColorPicker";
import { HabitPeriod, HabitType, HabitMetric, HabitDuration, HabitGroup } from "../../types";
import { getToday } from "../../../../shared/utils/dateUtils";
import "./HabitForm.css";

interface HabitFormData {
  title: string;
  description: string;
  period: HabitPeriod;
  type: HabitType;
  frequency: number;
  daysOfWeek: number[];
  intervalDays: number;
  metric: HabitMetric | null;
  duration: HabitDuration;
  icon: string;
  color: string;
  group: string | null;
}

export interface HabitFormProps {
  initialData?: Partial<HabitFormData>;
  groups: HabitGroup[];
  onSubmit: (data: HabitFormData) => void;
  onCancel: () => void;
}

const DEFAULT_METRIC: HabitMetric = { unit: "pages", targetValue: 10, originalTarget: 10, isTimer: false };
const DEFAULT_DURATION: HabitDuration = { type: "continuing" };

export function HabitForm({ initialData, groups, onSubmit, onCancel }: HabitFormProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<HabitFormData>({
    title: "",
    description: "",
    period: "daily",
    type: "standard",
    frequency: 1,
    daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri default
    intervalDays: 2,
    metric: null,
    duration: DEFAULT_DURATION,
    icon: "Target",
    color: "#5B8DEF",
    group: null,
    ...initialData,
  });

  const [newGroupName, setNewGroupName] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const update = (updates: Partial<HabitFormData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const currentStepIsValid = () => {
    switch (step) {
      case 0: return data.title.trim() !== "";
      case 1: return true; // Period
      case 2: return true; // Type
      case 3: // Config
        if (data.type !== "standard") {
          return !!data.metric && data.metric.targetValue > 0 && data.metric.unit.trim() !== "";
        }
        return data.frequency > 0;
      case 4: // Duration
        if (data.duration.type === "endpoint") return !!data.duration.endDate || !!data.duration.completionCount;
        return true;
      case 5: return !!data.icon && !!data.color; // Appearance
      case 6: return true; // Group (optional)
      default: return true;
    }
  };

  const handleNext = () => {
    if (step < 6) setStep(step + 1);
    else handleSubmit();
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
    else onCancel();
  };

  const handleSubmit = () => {
    onSubmit(data);
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="habit-form__step">
            <h2 className="t-label">[ BASICS ]</h2>
            <div className="habit-form__field">
              <label className="t-meta">TITLE</label>
              <input 
                type="text" 
                className="t-data habit-form__input" 
                placeholder="E.g. Morning Read" 
                value={data.title} 
                onChange={e => update({ title: e.target.value })}
                autoFocus
              />
            </div>
            <div className="habit-form__field">
              <label className="t-meta">DESCRIPTION (OPTIONAL)</label>
              <textarea 
                className="t-body habit-form__input habit-form__textarea" 
                placeholder="Why are you doing this?"
                value={data.description} 
                onChange={e => update({ description: e.target.value })}
              />
            </div>
          </div>
        );

      case 1:
        return (
          <div className="habit-form__step">
            <h2 className="t-label">[ PERIOD ]</h2>
            <p className="t-meta habit-form__help">How often is this evaluated?</p>
            <div className="habit-form__radio-group">
              {(["daily", "weekly", "monthly", "interval"] as HabitPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`habit-form__radio-btn t-body ${data.period === p ? "habit-form__radio-btn--active" : ""}`}
                  onClick={() => update({ period: p })}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="habit-form__step">
            <h2 className="t-label">[ TYPE ]</h2>
            <div className="habit-form__radio-group">
              <button
                type="button"
                className={`habit-form__radio-btn t-body ${data.type === "standard" ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => update({ type: "standard", metric: null })}
              >
                STANDARD (Done/Not Done)
              </button>
              <button
                type="button"
                className={`habit-form__radio-btn t-body ${data.type === "metric" ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => update({ type: "metric", metric: data.metric || DEFAULT_METRIC })}
              >
                METRIC (Quantity/Target)
              </button>
              <button
                type="button"
                className={`habit-form__radio-btn t-body ${data.type === "limiter" ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => update({ type: "limiter", metric: data.metric || { ...DEFAULT_METRIC, unit: "cigarettes" } })}
              >
                LIMITER (Avoid/Reduce)
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="habit-form__step">
            <h2 className="t-label">[ CONFIGURATION ]</h2>
            
            {data.period === "weekly" && (
              <div className="habit-form__field">
                <label className="t-meta">DAYS OF WEEK</label>
                <div className="habit-form__dow-picker">
                  {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`dow-btn ${data.daysOfWeek.includes(i) ? "dow-btn--active" : ""}`}
                      onClick={() => {
                        const newDow = data.daysOfWeek.includes(i)
                          ? data.daysOfWeek.filter((d) => d !== i)
                          : [...data.daysOfWeek, i];
                        update({ daysOfWeek: newDow });
                      }}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {data.period === "interval" && (
              <div className="habit-form__field">
                <label className="t-meta">EVERY N DAYS</label>
                <input 
                  type="number" 
                  className="t-data habit-form__input" 
                  min={1} 
                  value={data.intervalDays} 
                  onChange={e => update({ intervalDays: parseInt(e.target.value) || 1 })}
                />
              </div>
            )}

            {(data.period === "weekly" || data.period === "monthly") && (
              <div className="habit-form__field">
                <label className="t-meta">FREQUENCY TARGET</label>
                <p className="t-meta habit-form__help">How many times per period?</p>
                <input 
                  type="number" 
                  className="t-data habit-form__input" 
                  min={1} 
                  value={data.frequency} 
                  onChange={e => update({ frequency: parseInt(e.target.value) || 1 })}
                />
              </div>
            )}

            {data.type !== "standard" && data.metric && (
              <>
                <div className="habit-form__field">
                  <label className="t-meta">TARGET VALUE</label>
                  <input 
                    type="number" 
                    className="t-data habit-form__input" 
                    min={1} 
                    value={data.metric.targetValue} 
                    onChange={e => update({ 
                      metric: { ...data.metric!, targetValue: parseInt(e.target.value) || 1, originalTarget: parseInt(e.target.value) || 1 } 
                    })}
                  />
                </div>
                <div className="habit-form__field">
                  <label className="t-meta">UNIT (e.g. pages, cups)</label>
                  <input 
                    type="text" 
                    className="t-data habit-form__input" 
                    value={data.metric.unit} 
                    onChange={e => update({ metric: { ...data.metric!, unit: e.target.value } })}
                  />
                </div>
              </>
            )}
          </div>
        );

      case 4:
        return (
          <div className="habit-form__step">
            <h2 className="t-label">[ DURATION ]</h2>
            <div className="habit-form__radio-group">
              <button
                type="button"
                className={`habit-form__radio-btn t-body ${data.duration.type === "continuing" ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => update({ duration: { type: "continuing" } })}
              >
                CONTINUING (Forever)
              </button>
              <button
                type="button"
                className={`habit-form__radio-btn t-body ${data.duration.type === "endpoint" ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => update({ duration: { type: "endpoint", endDate: getToday() } })}
              >
                ENDPOINT (Target Goal)
              </button>
            </div>

            {data.duration.type === "endpoint" && (
              <div className="habit-form__field" style={{ marginTop: 24 }}>
                <label className="t-meta">END DATE</label>
                <input 
                  type="date" 
                  className="t-data habit-form__input" 
                  value={data.duration.endDate || getToday()} 
                  onChange={e => update({ duration: { ...data.duration, endDate: e.target.value } })}
                />
              </div>
            )}
          </div>
        );

      case 5:
        return (
          <div className="habit-form__step">
            <h2 className="t-label">[ APPEARANCE ]</h2>
            <div className="habit-form__field">
              <label className="t-meta">COLOR</label>
              <ColorPicker 
                selectedColor={data.color} 
                onSelect={(c: string) => update({ color: c })} 
              />
            </div>
            <div className="habit-form__field" style={{ marginTop: 24 }}>
              <label className="t-meta">ICON</label>
              <IconPicker 
                selectedIcon={data.icon} 
                onSelect={(i: string) => update({ icon: i })} 
              />
            </div>
          </div>
        );

      case 6:
        return (
          <div className="habit-form__step">
            <h2 className="t-label">[ GROUPING ]</h2>
            <p className="t-meta habit-form__help">Optional: Group your habits into categories.</p>
            
            <div className="habit-form__radio-group">
              <button
                type="button"
                className={`habit-form__radio-btn t-body ${data.group === null && !isCreatingGroup ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => { update({ group: null }); setIsCreatingGroup(false); }}
              >
                NO GROUP
              </button>

              {groups.map(g => (
                <button
                  key={g.id}
                  type="button"
                  className={`habit-form__radio-btn t-body ${data.group === g.id && !isCreatingGroup ? "habit-form__radio-btn--active" : ""}`}
                  onClick={() => { update({ group: g.id }); setIsCreatingGroup(false); }}
                >
                  {g.name.toUpperCase()}
                </button>
              ))}

              <button
                type="button"
                className={`habit-form__radio-btn t-body ${isCreatingGroup ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => setIsCreatingGroup(true)}
              >
                + NEW GROUP
              </button>
            </div>

            {isCreatingGroup && (
              <div className="habit-form__field" style={{ marginTop: 16 }}>
                <input 
                  type="text" 
                  className="t-data habit-form__input" 
                  placeholder="New Group Name" 
                  value={newGroupName} 
                  onChange={e => {
                    setNewGroupName(e.target.value);
                    // Generate a slug-like ID for the new group to submit
                    update({ group: `new_${e.target.value.toLowerCase().replace(/\s+/g, '_')}` });
                  }}
                  autoFocus
                />
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="habit-form">
      <div className="habit-form__header">
        <span className="t-meta">STEP {step + 1} OF 7</span>
        <button type="button" className="habit-form__close t-label" onClick={onCancel}>
          [ CANCEL ]
        </button>
      </div>
      
      <div className="habit-form__content">
        {renderStepContent()}
      </div>

      <div className="habit-form__footer">
        <button 
          type="button" 
          className="habit-form__btn t-label" 
          onClick={handleBack}
        >
          {step === 0 ? "[ CANCEL ]" : "[ BACK ]"}
        </button>
        <button 
          type="button" 
          className="habit-form__btn habit-form__btn--primary t-label" 
          onClick={handleNext}
          disabled={!currentStepIsValid()}
        >
          {step === 6 ? "[ SAVE HABIT ]" : "[ NEXT ]"}
        </button>
      </div>
    </div>
  );
}
