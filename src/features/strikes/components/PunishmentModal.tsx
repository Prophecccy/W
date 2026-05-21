import { useState, useEffect, useMemo, memo } from "react";
import { PunishmentChoice, PUNISHMENT_OPTIONS } from "../types";
import { LucideIcon } from "../../../shared/components/IconPicker/LucideIcon";
import { Habit, HabitGroup } from "../../habits/types";
import { getHabits, createHabit } from "../../habits/services/habitService";
import { getGroups } from "../../habits/services/groupService";
import { resetStrikes } from "../services/strikeService";
import { HabitForm } from "../../habits/components/HabitForm/HabitForm";
import { TodoForm } from "../../todos/components/TodoForm/TodoForm";
import "./PunishmentModal.css";

const getProposedDelta = (habit: Habit) => {
  if (!habit.metric) return "";
  const currentTarget = habit.metric.targetValue;
  const unit = habit.metric.unit || "reps";
  if (habit.type === "limiter") {
    const decrease = Math.max(1, Math.round(currentTarget / 3));
    const newTarget = Math.max(1, currentTarget - decrease);
    return `${currentTarget} → ${newTarget} ${unit} [ -${decrease} limit ]`;
  } else {
    const increase = Math.max(1, Math.round(currentTarget / 3));
    const newTarget = currentTarget + increase;
    return `${currentTarget} → ${newTarget} ${unit} [ +${increase} target ]`;
  }
};

interface HabitPenanceCardProps {
  habit: Habit;
  isSelected: boolean;
  proposedDelta: string;
  onSelect: (id: string) => void;
}

const HabitPenanceCard = memo(function HabitPenanceCard({
  habit,
  isSelected,
  proposedDelta,
  onSelect,
}: HabitPenanceCardProps) {
  return (
    <button
      className={`punishment-card ${isSelected ? "punishment-card--selected" : ""}`}
      onClick={() => onSelect(habit.id)}
    >
      <div className="punishment-card__icon" style={{ color: habit.type === "limiter" ? "var(--strike-red)" : habit.color }}>
        <LucideIcon name={habit.icon || "Activity"} size={24} />
      </div>
      <div className="punishment-card__text">
        <span className="t-label">{habit.title}</span>
        <span className="t-meta" style={{ color: "var(--text-muted)", marginTop: 4 }}>
          {habit.type.toUpperCase()} | {proposedDelta}
        </span>
      </div>
      {isSelected && (
        <div className="punishment-card__check">
          <LucideIcon name="Check" size={16} />
        </div>
      )}
    </button>
  );
});

interface PunishmentModalProps {
  onConfirm: (choice: PunishmentChoice, habitId?: string, completedInline?: boolean) => void;
  onCancel: () => void;
}

type PunishmentStep = "select_penance" | "select_habit" | "habit_form" | "todo_form";

export function PunishmentModal({ onConfirm, onCancel }: PunishmentModalProps) {
  const [step, setStep] = useState<PunishmentStep>("select_penance");
  const [selected, setSelected] = useState<PunishmentChoice | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Difficulty Increase Selection
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loadingHabits, setLoadingHabits] = useState(false);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);

  // Groups for Form Creation
  const [groups, setGroups] = useState<HabitGroup[]>([]);

  // Fetch active habits when transitioning to selection screen
  useEffect(() => {
    if (step === "select_habit") {
      setLoadingHabits(true);
      getHabits()
        .then((data) => {
          const eligible = data.filter(
            (h) => (h.type === "metric" || h.type === "limiter") && h.isActive && h.metric
          );
          setHabits(eligible);
          if (eligible.length > 0) {
            setSelectedHabitId(eligible[0].id);
          }
        })
        .catch((err) => console.error("Error loading habits for penance:", err))
        .finally(() => setLoadingHabits(false));
    }
  }, [step]);

  // Fetch groups for forms
  useEffect(() => {
    if (step === "habit_form" || step === "todo_form") {
      getGroups()
        .then(setGroups)
        .catch((err) => console.error("Error loading groups for penance:", err));
    }
  }, [step]);

  const handleConfirm = () => {
    if (!selected) return;

    if (selected === "increase_difficulty") {
      if (step === "select_penance") {
        setStep("select_habit");
      } else if (step === "select_habit" && selectedHabitId) {
        setConfirming(true);
        onConfirm("increase_difficulty", selectedHabitId);
      }
    } else if (selected === "add_habit") {
      setStep("habit_form");
    } else if (selected === "add_todo") {
      setStep("todo_form");
    }
  };

  const handleHabitSubmit = async (data: any) => {
    try {
      setConfirming(true);
      const allHabits = await getHabits();
      const newHabit = {
        title: data.title,
        description: data.description,
        icon: data.icon,
        color: data.color,
        period: data.period,
        type: data.type,
        frequency: data.frequency,
        daysOfWeek: data.daysOfWeek,
        intervalDays: data.intervalDays,
        metric: data.metric,
        duration: data.duration,
        group: data.group,
        startDate: data.startDate,
        isActive: true,
        order: allHabits.length,
        createdAt: Date.now(),
        lastCompletedDate: null,
        archivedAt: null,
        level: 0,
        currentStreak: 0,
        longestStreak: 0,
        totalCompletions: 0,
        levelProgress: 0,
      };

      await createHabit(newHabit as Omit<Habit, "id" | "uid">);
      await resetStrikes();
      onConfirm("add_habit", undefined, true);
    } catch (e) {
      console.error("Failed to create penance habit:", e);
      setConfirming(false);
    }
  };

  const handleTodoSuccess = async () => {
    try {
      setConfirming(true);
      await resetStrikes();
      onConfirm("add_todo", undefined, true);
    } catch (e) {
      console.error("Failed to resolve strikes for penance todo:", e);
      setConfirming(false);
    }
  };

  // Pre-calculate deltas to prevent CPU churn during selection toggles
  const proposedDeltas = useMemo(() => {
    const deltas: Record<string, string> = {};
    habits.forEach((h) => {
      deltas[h.id] = getProposedDelta(h);
    });
    return deltas;
  }, [habits]);

  // ── Render: Habit Form Step ─────────────────────────────────────
  if (step === "habit_form") {
    return (
      <div className="punishment-overlay">
        <div className="punishment-modal punishment-modal--form" onClick={(e) => e.stopPropagation()}>
          <HabitForm
            groups={groups}
            onSubmit={handleHabitSubmit}
            onCancel={() => setStep("select_penance")}
          />
        </div>
      </div>
    );
  }

  // ── Render: Todo Form Step ──────────────────────────────────────
  if (step === "todo_form") {
    return (
      <div className="punishment-overlay">
        <div className="punishment-modal punishment-modal--form" onClick={(e) => e.stopPropagation()}>
          <TodoForm
            groups={groups}
            onClose={() => setStep("select_penance")}
            onSuccess={handleTodoSuccess}
          />
        </div>
      </div>
    );
  }

  // ── Render: Selection Step ──────────────────────────────────────
  return (
    <div className="punishment-overlay" onClick={onCancel}>
      <div className="punishment-modal" onClick={(e) => e.stopPropagation()}>
        {step === "select_penance" ? (
          <>
            <div className="punishment-modal__header">
              <h2 className="t-display">[ CHOOSE YOUR PENANCE ]</h2>
              <p className="t-body" style={{ color: "var(--text-muted)", marginTop: 8 }}>
                Select one option to resolve your lockout and reset strikes to 0.
              </p>
            </div>

            <div className="punishment-modal__options">
              {PUNISHMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`punishment-card ${selected === opt.id ? "punishment-card--selected" : ""}`}
                  onClick={() => setSelected(opt.id)}
                >
                  <div className="punishment-card__icon">
                    <LucideIcon name={opt.icon} size={24} />
                  </div>
                  <div className="punishment-card__text">
                    <span className="t-label">{opt.title}</span>
                    <span className="t-meta" style={{ color: "var(--text-muted)", marginTop: 4 }}>
                      {opt.description}
                    </span>
                  </div>
                  {selected === opt.id && (
                    <div className="punishment-card__check">
                      <LucideIcon name="Check" size={16} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="punishment-modal__footer">
              <button className="t-label punishment-modal__cancel" onClick={onCancel}>
                [ CANCEL ]
              </button>
              <button
                className="t-label punishment-modal__confirm"
                onClick={handleConfirm}
                disabled={!selected || confirming}
              >
                {confirming ? "[ RESOLVING... ]" : "[ CONFIRM ]"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="punishment-modal__header">
              <h2 className="t-display">[ SELECT TARGET HABIT ]</h2>
              <p className="t-body" style={{ color: "var(--text-muted)", marginTop: 8 }}>
                Select an active habit to adjust its difficulty.
              </p>
            </div>

            <div className="punishment-modal__options punishment-modal__options--scroll">
              {loadingHabits ? (
                <div className="punishment-modal__loading t-meta">[ RETRIEVING HABITS... ]</div>
              ) : habits.length === 0 ? (
                <div className="punishment-modal__empty">
                  <span className="t-meta" style={{ color: "var(--strike-red)" }}>
                    [ NO ELIGIBLE HABITS FOUND ]
                  </span>
                  <span className="t-body mt-2" style={{ color: "var(--text-muted)", textAlign: "center", fontSize: "14px" }}>
                    Increasing difficulty requires active Metric or Limiter habits. Please select another penance.
                  </span>
                </div>
              ) : (
                habits.map((h) => (
                  <HabitPenanceCard
                    key={h.id}
                    habit={h}
                    isSelected={selectedHabitId === h.id}
                    proposedDelta={proposedDeltas[h.id] || ""}
                    onSelect={setSelectedHabitId}
                  />
                ))
              )}
            </div>

            <div className="punishment-modal__footer">
              <button className="t-label punishment-modal__cancel" onClick={() => setStep("select_penance")}>
                [ BACK ]
              </button>
              <button
                className="t-label punishment-modal__confirm"
                onClick={handleConfirm}
                disabled={habits.length === 0 || !selectedHabitId || confirming}
              >
                {confirming ? "[ APPLYING... ]" : "[ CONFIRM ]"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
