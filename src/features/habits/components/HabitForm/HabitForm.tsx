import { useState } from "react";
import { IconPicker } from "../../../../shared/components/IconPicker/IconPicker";
import { HabitPeriod, HabitType, HabitMetric, HabitDuration, HabitGroup } from "../../types";
import { getToday, addDays } from "../../../../shared/utils/dateUtils";
import { sanitizeText } from "../../../../shared/utils/security";
import { DatePicker } from "../../../../shared/components/DatePicker/DatePicker";
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
  newGroupName?: string;
}

export interface HabitFormProps {
  initialData?: Partial<HabitFormData>;
  groups: HabitGroup[];
  onSubmit: (data: HabitFormData) => Promise<void> | void;
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
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      case 0: {
        if (data.title.trim() === "") return false;
        if (data.period === "interval") {
          const days = Number(intervalDays);
          if (intervalDays.trim() === "" || isNaN(days) || days < 2) return false;
        }
        if (data.type === "metric" || data.type === "limiter") {
          if (!data.metric) return false;
          const targetVal = Number(data.metric.targetValue);
          const unit = data.metric.unit.trim();
          const minTarget = data.type === "limiter" ? 1 : 2;
          if (isNaN(targetVal) || targetVal < minTarget || unit === "") return false;
        }
        if (data.duration.type === "endpoint") {
          if (!data.duration.endDate || data.duration.endDate < data.startDate) return false;
        }
        return !!data.startDate;
      }
      case 1: return !!data.icon; // Appearance
      case 2: return true; // Group (optional)
      default: return true;
    }
  };

  const handleNext = () => {
    if (step === 0) {
      const updates: Partial<HabitFormData> = {};
      if (data.period === "interval") {
        const days = Number(intervalDays);
        if (intervalDays.trim() === "" || isNaN(days) || days < 2) {
          setError("Interval must be a number greater than 1 day.");
          return;
        }
        updates.intervalDays = days;
      }
      
      if (data.type === "metric" || data.type === "limiter") {
        if (!data.metric) {
          setError("Metric configuration is required.");
          return;
        }
        const targetVal = Number(data.metric.targetValue);
        const unit = data.metric.unit.trim();
        const minTarget = data.type === "limiter" ? 1 : 2;
        if (isNaN(targetVal) || targetVal < minTarget || unit === "") {
          setError(data.type === "limiter" ? "Target must be at least 1 and metric label must not be empty." : "Target must be at least 2 and metric label must not be empty.");
          return;
        }
      }

      if (data.duration.type === "endpoint") {
        if (!data.duration.endDate || data.duration.endDate < data.startDate) {
          setError("End date must be greater than or equal to start date.");
          return;
        }
      }
      setError(null);
      update(updates);
    }
    if (step < 2) setStep(step + 1);
    else handleSubmit();
  };

  const handleBack = () => {
    setError(null);
    if (step > 0) setStep(step - 1);
    else onCancel();
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...data,
        title: sanitizeText(data.title, 100),
        description: data.description ? sanitizeText(data.description, 500) : "",
        newGroupName: isCreatingGroup && newGroupName.trim() ? sanitizeText(newGroupName, 50) : undefined,
      });
    } catch (err) {
      console.error("Submission failed:", err);
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="habit-form__step habit-form__step--config">
            <div className="habit-form__cols">
              {/* Column 1: Basics */}
              <div className="habit-form__col">
                <h2 className="t-label">[ 1. BASICS ]</h2>
                
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

              {/* Column 2: Protocol Type */}
              <div className="habit-form__col">
                <h2 className="t-label">[ 2. PROTOCOL TYPE ]</h2>

                <div className="habit-form__field">
                  <label className="t-meta">TYPE</label>
                  <div className="habit-form__radio-group-compact">
                    <button
                      type="button"
                      className={`habit-form__radio-btn-compact t-body ${data.type === "standard" ? "habit-form__radio-btn-compact--active" : ""}`}
                      onClick={() => update({ type: "standard", metric: null })}
                    >
                      STANDARD (Done/Not Done)
                    </button>
                    <button
                      type="button"
                      className={`habit-form__radio-btn-compact t-body ${data.type === "metric" ? "habit-form__radio-btn-compact--active" : ""}`}
                      onClick={() => update({ type: "metric", metric: data.metric || DEFAULT_METRIC })}
                    >
                      METRIC (Quantity/Target)
                    </button>
                    <button
                      type="button"
                      className={`habit-form__radio-btn-compact t-body ${data.type === "limiter" ? "habit-form__radio-btn-compact--active" : ""}`}
                      onClick={() => update({ type: "limiter", metric: data.metric || DEFAULT_METRIC })}
                    >
                      LIMITER (Avoid/Reduce)
                    </button>
                  </div>
                </div>

                {(data.type === "metric" || data.type === "limiter") && data.metric && (
                  <div className="habit-form__metric-fields">
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

                <div className="habit-form__field" style={{ marginTop: 8 }}>
                  <label className="t-meta">DURATION</label>
                  <div className="habit-form__radio-group-compact">
                    <button
                      type="button"
                      className={`habit-form__radio-btn-compact t-body ${data.duration.type === "continuing" ? "habit-form__radio-btn-compact--active" : ""}`}
                      onClick={() => update({ duration: { type: "continuing" } })}
                    >
                      CONTINUING (Forever)
                    </button>
                    <button
                      type="button"
                      className={`habit-form__radio-btn-compact t-body ${data.duration.type === "endpoint" ? "habit-form__radio-btn-compact--active" : ""}`}
                      onClick={() => update({ duration: { type: "endpoint", endDate: getToday() } })}
                    >
                      ENDPOINT (Target Goal)
                    </button>
                  </div>
                </div>

                {data.duration.type === "endpoint" && (
                  <div className="habit-form__field">
                    <label className="t-meta">END DATE</label>
                    <DatePicker
                      value={data.duration.endDate || getToday()}
                      onChange={val => update({ duration: { ...data.duration, endDate: val } })}
                      min={getToday()}
                      placeholder="SELECT END DATE..."
                    />
                  </div>
                )}
              </div>

              {/* Column 3: Schedule & Date */}
              <div className="habit-form__col">
                <h2 className="t-label">[ 3. SCHEDULE ]</h2>

                <div className="habit-form__field">
                  <label className="t-meta">EVALUATION PERIOD</label>
                  <div className="habit-form__radio-group-compact">
                    {(["daily", "weekly", "monthly", "interval"] as HabitPeriod[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`habit-form__radio-btn-compact t-body ${data.period === p ? "habit-form__radio-btn-compact--active" : ""}`}
                        onClick={() => {
                          update({ period: p });
                          setError(null);
                        }}
                      >
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {data.period === "interval" && (
                  <div className="habit-form__field">
                    <label className="t-meta">INTERVAL DAYS</label>
                    <input
                      type="number"
                      className="t-data habit-form__input"
                      placeholder="E.g. 3"
                      value={intervalDays}
                      onChange={(e) => {
                        const val = e.target.value;
                        setIntervalDays(val);
                        setError(null);
                      }}
                      autoFocus
                    />
                  </div>
                )}

                {data.period === "weekly" && (
                  <div className="habit-form__field">
                    <label className="t-meta">DAYS OF WEEK</label>
                    <div className="habit-form__days-selector">
                      {["S", "M", "T", "W", "T", "F", "S"].map((dayName, idx) => {
                        const active = (data.daysOfWeek || [0,1,2,3,4,5,6]).includes(idx);
                        return (
                          <button
                            key={idx}
                            type="button"
                            className={`habit-form__day-btn ${active ? "habit-form__day-btn--active" : ""}`}
                            onClick={() => {
                              const currentDays = data.daysOfWeek || [0,1,2,3,4,5,6];
                              const nextDays = active
                                ? currentDays.filter(d => d !== idx)
                                : [...currentDays, idx].sort((a, b) => a - b);
                              update({ daysOfWeek: nextDays });
                            }}
                          >
                            {dayName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="habit-form__field" style={{ marginTop: 8 }}>
                  <label className="t-meta">COMMENCEMENT</label>
                  <div className="habit-form__radio-group-compact">
                    <button
                      type="button"
                      className={`habit-form__radio-btn-compact t-body ${startDateOption === "today" ? "habit-form__radio-btn-compact--active" : ""}`}
                      onClick={() => {
                        setStartDateOption("today");
                        update({ startDate: todayDate });
                      }}
                    >
                      TODAY
                    </button>
                    <button
                      type="button"
                      className={`habit-form__radio-btn-compact t-body ${startDateOption === "tomorrow" ? "habit-form__radio-btn-compact--active" : ""}`}
                      onClick={() => {
                        setStartDateOption("tomorrow");
                        update({ startDate: tomorrowDate });
                      }}
                    >
                      TOMORROW
                    </button>
                    <button
                      type="button"
                      className={`habit-form__radio-btn-compact t-body ${startDateOption === "custom" ? "habit-form__radio-btn-compact--active" : ""}`}
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
                </div>

                <div className={`habit-form__custom-date-container ${startDateOption === "custom" ? "habit-form__custom-date-container--visible" : ""}`}>
                  <div className="habit-form__field">
                    <label className="t-meta">SPECIFY DATE</label>
                    <DatePicker
                      value={data.startDate || todayDate}
                      onChange={val => update({ startDate: val })}
                      min={todayDate}
                      placeholder="SELECT START DATE..."
                    />
                  </div>
                </div>
              </div>
            </div>
            {error && <span className="habit-form__error t-meta">{error}</span>}
          </div>
        );

      case 1:
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
                    setStep(2);
                  }, 220);
                }} 
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="habit-form__step">
            <h2 className="t-label">[ GROUPING ]</h2>
            <p className="t-meta habit-form__help">Optional: Group your habits into categories.</p>
            
            <div className="habit-form__group-grid">
              <button
                type="button"
                className={`habit-form__radio-btn t-body ${data.group === null && !isCreatingGroup ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => { update({ group: null }); setIsCreatingGroup(false); setNewGroupName(""); }}
              >
                NO GROUP
              </button>

              {groups.map(g => (
                <button
                  key={g.id}
                  type="button"
                  className={`habit-form__radio-btn t-body ${data.group === g.id && !isCreatingGroup ? "habit-form__radio-btn--active" : ""}`}
                  onClick={() => { update({ group: g.id }); setIsCreatingGroup(false); setNewGroupName(""); }}
                >
                  {g.name.toUpperCase()}
                </button>
              ))}

              <button
                type="button"
                className={`habit-form__radio-btn t-body ${isCreatingGroup ? "habit-form__radio-btn--active" : ""}`}
                onClick={() => {
                  setIsCreatingGroup(true);
                  if (newGroupName.trim()) {
                    update({ group: `new_${newGroupName.trim().toLowerCase().replace(/\s+/g, '_')}` });
                  } else {
                    update({ group: null });
                  }
                }}
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
    <div className="habit-form habit-form--wide">
      <div className="habit-form__header">
        <span className="t-meta">STEP {step + 1} OF 3</span>
        <button type="button" className="habit-form__close t-label" onClick={onCancel}>
          [ CANCEL ]
        </button>
      </div>
      
      <div className="habit-form__content">
        {renderStepContent()}
      </div>

      <div className="habit-form__footer">
        {step > 0 ? (
          <button 
            type="button" 
            className="habit-form__btn t-label" 
            onClick={handleBack}
          >
            [ BACK ]
          </button>
        ) : (
          <div />
        )}
        <button 
          type="button" 
          className="habit-form__btn habit-form__btn--primary t-label" 
          onClick={handleNext}
          disabled={!currentStepIsValid() || isSubmitting}
        >
          {step === 2 ? (isSubmitting ? "[ CREATING... ]" : "[ SAVE HABIT ]") : "[ NEXT ]"}
        </button>
      </div>
    </div>
  );
}
