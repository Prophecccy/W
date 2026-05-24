import { useState } from "react";
import { IconPicker } from "../../../../shared/components/IconPicker/IconPicker";
import { HabitPeriod, HabitType, HabitMetric, HabitDuration, HabitGroup } from "../../types";
import { getToday, addDays } from "../../../../shared/utils/dateUtils";
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
  startDate: string;
}

export interface HabitFormProps {
  initialData?: Partial<HabitFormData>;
  groups: HabitGroup[];
  onSubmit: (data: HabitFormData) => void;
  onCancel: () => void;
  userResetTime?: string;
}

const DEFAULT_METRIC: HabitMetric = { unit: "", targetValue: "" as any, originalTarget: "" as any };
const DEFAULT_DURATION: HabitDuration = { type: "continuing" };

export function HabitForm({ initialData, groups, onSubmit, onCancel, userResetTime }: HabitFormProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<HabitFormData>({
    title: "",
    description: "",
    period: "daily",
    type: "standard",
    frequency: 1,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All 7 days default
    intervalDays: 2,
    metric: null,
    duration: DEFAULT_DURATION,
    icon: "Target",
    color: "#5B8DEF",
    group: null,
    startDate: getToday(undefined, userResetTime),
    ...initialData,
  });

  const [newGroupName, setNewGroupName] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [intervalDays, setIntervalDays] = useState(initialData?.intervalDays ? String(initialData.intervalDays) : "");
  const [error, setError] = useState<string | null>(null);

  const todayDate = getToday(undefined, userResetTime);
  const tomorrowDate = addDays(todayDate, 1);
  const initialOption = data.startDate === todayDate
    ? "today"
    : data.startDate === tomorrowDate
      ? "tomorrow"
      : "custom";
  const [startDateOption, setStartDateOption] = useState<"today" | "tomorrow" | "custom">(initialOption);

  const update = (updates: Partial<HabitFormData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const currentStepIsValid = () => {
    switch (step) {
      case 0: return data.title.trim() !== "";
      case 1: return true; // Period
      case 2:
        if (data.type === "metric" || data.type === "limiter") {
          if (!data.metric) return false;
          const targetVal = Number(data.metric.targetValue);
          const unit = data.metric.unit.trim();
          const minTarget = data.type === "limiter" ? 1 : 2;
          return !isNaN(targetVal) && targetVal >= minTarget && unit !== "";
        }
        return true; // Type
      case 3: // Duration
        if (data.duration.type === "endpoint") return !!data.duration.endDate || !!data.duration.completionCount;
        return true;
      case 4: return !!data.startDate; // Start Date
      case 5: return !!data.icon; // Appearance
      case 6: return true; // Group (optional)
      default: return true;
    }
  };

  const handleNext = () => {
    if (step === 1 && data.period === "interval") {
      const days = Number(intervalDays);
      if (intervalDays.trim() === "" || isNaN(days) || days < 2) {
        setError("Interval must be a number greater than 1 day.");
        return;
      }
      setError(null);
      update({ intervalDays: days });
    }
    if (step < 6) setStep(step + 1);
    else handleSubmit();
  };

  const handleBack = () => {
    setError(null);
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
                  onClick={() => {
                    update({ period: p });
                    setError(null);
                  }}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
            {data.period === "interval" && (
              <div className="habit-form__field habit-form__interval-field">
                <label className="t-label">[ INTERVAL DAYS ]</label>
                <input
                  type="number"
                  className="t-data habit-form__input habit-form__interval-input"
                  placeholder="E.g. 3"
                  value={intervalDays}
                  onChange={(e) => {
                    const val = e.target.value;
                    setIntervalDays(val);
                    setError(null);
                  }}
                  autoFocus
                />
                {error && <span className="habit-form__error t-meta">{error}</span>}
              </div>
            )}
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
                onClick={() => update({ type: "limiter", metric: data.metric || DEFAULT_METRIC })}
              >
                LIMITER (Avoid/Reduce)
              </button>
            </div>

            {(data.type === "metric" || data.type === "limiter") && data.metric && (
              <div style={{ marginTop: 24 }}>
                <div className="habit-form__field">
                  <label className="t-meta">TARGET NUMBER</label>
                  <input
                    type="number"
                    className="t-data habit-form__input"
                    value={data.metric.targetValue}
                    min={data.type === "limiter" ? 1 : 2}
                    step={1}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        update({ metric: { ...data.metric!, targetValue: "" as any, originalTarget: "" as any } });
                        return;
                      }
                      const n = Number(val);
                      if (!Number.isFinite(n)) return;
                      update({ metric: { ...data.metric!, targetValue: n, originalTarget: n } });
                    }}
                  />
                </div>
                <div className="habit-form__field">
                  <label className="t-meta">METRIC LABEL</label>
                  <input
                    type="text"
                    className="t-data habit-form__input"
                    placeholder="E.g. pages, sessions, ml, hours"
                    value={data.metric.unit}
                    onChange={(e) => update({ metric: { ...data.metric!, unit: e.target.value } })}
                  />
                </div>
              </div>
            )}
          </div>
        );

      case 3:
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

      case 4:
        return (
          <div className="habit-form__step">
            <h2 className="t-label">[ START DATE ]</h2>
            <p className="t-meta habit-form__help">When should this protocol become active?</p>
            
            <div className="habit-form__radio-group">
              <button
                type="button"
                className={`habit-form__radio-btn t-body ${startDateOption === "today" ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => {
                  setStartDateOption("today");
                  update({ startDate: todayDate });
                }}
              >
                TODAY
              </button>
              <button
                type="button"
                className={`habit-form__radio-btn t-body ${startDateOption === "tomorrow" ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => {
                  setStartDateOption("tomorrow");
                  update({ startDate: tomorrowDate });
                }}
              >
                TOMORROW
              </button>
              <button
                type="button"
                className={`habit-form__radio-btn t-body ${startDateOption === "custom" ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => {
                  setStartDateOption("custom");
                  const nextDate = data.startDate && data.startDate !== todayDate && data.startDate !== tomorrowDate
                    ? data.startDate
                    : tomorrowDate;
                  update({ startDate: nextDate });
                }}
              >
                SELECT DATE
              </button>
            </div>

            <div className={`habit-form__custom-date-container ${startDateOption === "custom" ? "habit-form__custom-date-container--visible" : ""}`}>
              <div className="habit-form__field">
                <label className="t-meta">SPECIFY PROTOCOL COMMENCEMENT</label>
                <input
                  type="date"
                  className="t-data habit-form__date-input"
                  value={data.startDate || todayDate}
                  min={todayDate}
                  onChange={(e) => update({ startDate: e.target.value })}
                />
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="habit-form__step habit-form__step--appearance">
            <h2 className="t-label">[ APPEARANCE ]</h2>
            <div className="habit-form__field habit-form__field--full">
              <label className="t-meta">ICON</label>
              <IconPicker 
                selectedIcon={data.icon} 
                onSelect={(i: string) => {
                  update({ icon: i });
                  setTimeout(() => {
                    setStep(6);
                  }, 220); // 220ms delay for smooth transition and visual feedback
                }} 
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
