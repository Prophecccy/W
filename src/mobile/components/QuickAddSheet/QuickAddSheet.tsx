import { useState } from "react";
import { motion } from "framer-motion";
import { BottomSheet } from "../BottomSheet/BottomSheet";
import { createHabit } from "../../../features/habits/services/habitService";
import { createTodo } from "../../../features/todos/services/todoService";
import { HabitPeriod, HabitType } from "../../../features/habits/types";
import { SPRING_TACTILE } from "../../../shared/constants/motion";
import { playMechanicalClick, playCompletionSound } from "../../../shared/services/tactileAudioService";
import { useToast } from "../../../shared/components/Toast/Toast";
import "./QuickAddSheet.css";

interface QuickAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function QuickAddSheet({ isOpen, onClose, onSuccess }: QuickAddSheetProps) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"habit" | "todo">("habit");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Habit specific states
  const [habitType, setHabitType] = useState<HabitType>("standard");
  const [period, setPeriod] = useState<HabitPeriod>("daily");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);

  // Todo specific states
  const [color, setColor] = useState<string>("#5B8DEF");

  const toggleDay = (day: number) => {
    playMechanicalClick();
    setDaysOfWeek((prev) =>
      prev.includes(day)
        ? prev.length > 1
          ? prev.filter((d) => d !== day)
          : prev
        : [...prev, day].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    playMechanicalClick();

    try {
      if (tab === "habit") {
        await createHabit({
          title: title.trim(),
          type: habitType,
          period,
          order: Date.now(),
          color: "#5B8DEF",
          daysOfWeek: period === "specific_days" ? daysOfWeek : undefined,
          targetValue: habitType === "metric" ? 1 : undefined,
          streak: 0,
        } as any);
        playCompletionSound();
        showToast("[ HABIT PROTOCOL INITIALIZED ]");
      } else {
        await createTodo({
          title: title.trim(),
          type: "standard",
          group: null,
          description: "",
          deadline: null,
          future: null,
          order: Date.now(),
          color: color || "#5B8DEF",
        });
        playCompletionSound();
        showToast("[ TODO DIRECTIVE LOGGED ]");
      }

      // Reset and trigger refresh
      setTitle("");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("w:data-synced"));
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("[QuickAddSheet] Error creating item:", err);
      showToast("[ CREATION FAILED ]");
    } finally {
      setSubmitting(false);
    }
  };

  const DAYS = [
    { label: "M", val: 1 },
    { label: "T", val: 2 },
    { label: "W", val: 3 },
    { label: "T", val: 4 },
    { label: "F", val: 5 },
    { label: "S", val: 6 },
    { label: "S", val: 0 },
  ];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={tab === "habit" ? "[ NEW HABIT ]" : "[ NEW DIRECTIVE ]"}>
      <div className="quick-add-sheet">
        {/* Tab Selector */}
        <div className="quick-add__tabs" role="tablist">
          <motion.button
            type="button"
            className={`quick-add__tab ${tab === "habit" ? "quick-add__tab--active" : ""}`}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_TACTILE}
            onClick={() => {
              playMechanicalClick();
              setTab("habit");
            }}
          >
            [ + HABIT ]
          </motion.button>
          <motion.button
            type="button"
            className={`quick-add__tab ${tab === "todo" ? "quick-add__tab--active" : ""}`}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_TACTILE}
            onClick={() => {
              playMechanicalClick();
              setTab("todo");
            }}
          >
            [ + TODO ]
          </motion.button>
        </div>

        <form onSubmit={handleSubmit} className="quick-add__form">
          <div className="quick-add__field">
            <label className="quick-add__label t-label">
              {tab === "habit" ? "HABIT DESIGNATION" : "DIRECTIVE TITLE"}
            </label>
            <input
              type="text"
              autoFocus
              className="quick-add__input"
              placeholder={tab === "habit" ? "e.g., Cold Plunge, Read 20 Pages..." : "e.g., Deploy production build..."}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          {tab === "habit" ? (
            <>
              <div className="quick-add__field">
                <label className="quick-add__label t-label">TRACKING TYPE</label>
                <div className="quick-add__pill-row">
                  <button
                    type="button"
                    className={`quick-add__pill ${habitType === "standard" ? "quick-add__pill--active" : ""}`}
                    onClick={() => {
                      playMechanicalClick();
                      setHabitType("standard");
                    }}
                  >
                    CHECKMARK
                  </button>
                  <button
                    type="button"
                    className={`quick-add__pill ${habitType === "metric" ? "quick-add__pill--active" : ""}`}
                    onClick={() => {
                      playMechanicalClick();
                      setHabitType("metric");
                    }}
                  >
                    COUNTER
                  </button>
                  <button
                    type="button"
                    className={`quick-add__pill ${habitType === "limiter" ? "quick-add__pill--active" : ""}`}
                    onClick={() => {
                      playMechanicalClick();
                      setHabitType("limiter");
                    }}
                  >
                    LIMITER
                  </button>
                </div>
              </div>

              <div className="quick-add__field">
                <label className="quick-add__label t-label">CADENCE</label>
                <div className="quick-add__pill-row">
                  <button
                    type="button"
                    className={`quick-add__pill ${period === "daily" ? "quick-add__pill--active" : ""}`}
                    onClick={() => {
                      playMechanicalClick();
                      setPeriod("daily");
                    }}
                  >
                    DAILY
                  </button>
                  <button
                    type="button"
                    className={`quick-add__pill ${period === "specific_days" ? "quick-add__pill--active" : ""}`}
                    onClick={() => {
                      playMechanicalClick();
                      setPeriod("specific_days");
                    }}
                  >
                    SPECIFIC DAYS
                  </button>
                </div>
              </div>

              {period === "specific_days" && (
                <div className="quick-add__field">
                  <label className="quick-add__label t-label">ACTIVE DAYS</label>
                  <div className="quick-add__days-grid">
                    {DAYS.map((d) => {
                      const isSelected = daysOfWeek.includes(d.val);
                      return (
                        <button
                          key={d.val}
                          type="button"
                          className={`quick-add__day-btn ${isSelected ? "quick-add__day-btn--selected" : ""}`}
                          onClick={() => toggleDay(d.val)}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="quick-add__field">
              <label className="quick-add__label t-label">STRIP COLOR</label>
              <div className="quick-add__color-grid" style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "8px" }}>
                {["#5B8DEF", "#4ADE80", "#E8736C", "#F59E0B", "#C084FC", "#2DD4BF", "#F472B6", "#6B7280"].map((c) => {
                  const isSelected = color.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        background: isSelected ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.03)",
                        border: `1.5px solid ${isSelected ? c : "rgba(255, 255, 255, 0.12)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      onClick={() => {
                        playMechanicalClick();
                        setColor(c);
                      }}
                    >
                      <span style={{ width: "14px", height: "14px", borderRadius: "50%", background: c, boxShadow: isSelected ? `0 0 8px ${c}` : "none" }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="quick-add__actions">
            <motion.button
              type="submit"
              disabled={!title.trim() || submitting}
              className="quick-add__submit-btn"
              whileTap={{ scale: 0.97 }}
              transition={SPRING_TACTILE}
            >
              {submitting
                ? "[ COMMITTING... ]"
                : tab === "habit"
                ? "[ INITIALIZE PROTOCOL ]"
                : "[ ADD DIRECTIVE ]"}
            </motion.button>
          </div>
        </form>
      </div>
    </BottomSheet>
  );
}
