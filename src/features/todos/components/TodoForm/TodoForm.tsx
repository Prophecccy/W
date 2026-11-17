import { useState } from "react";
import { Pipette } from "lucide-react";
import { Todo, TodoType } from "../../types";
import { createTodo, updateTodo } from "../../services/todoService";
import { HabitGroup } from "../../../habits/types";
import { createGroup, sanitizeGroupName } from "../../../habits/services/groupService";
import { getToday } from "../../../../shared/utils/dateUtils";
import { sanitizeText } from "../../../../shared/utils/security";
import { DatePicker } from "../../../../shared/components/DatePicker/DatePicker";
import "./TodoForm.css";

export const TODO_STRIP_COLORS = [
  "#5B8DEF", // Endfield Blue
  "#4ADE80", // Emerald Green
  "#E8736C", // Rose Red
  "#F59E0B", // Amber Orange
  "#C084FC", // Violet Purple
  "#2DD4BF", // Cyan Teal
  "#F472B6", // Pink
  "#6B7280", // Slate Gray
];

interface TodoFormProps {
  onClose: () => void;
  onSuccess?: () => void;
  groups?: HabitGroup[];
  dailyResetTime?: string;
  todoToEdit?: Todo;
}

export function TodoForm({ onClose, onSuccess, groups = [], dailyResetTime, todoToEdit }: TodoFormProps) {
  const todayStr = getToday(undefined, dailyResetTime);

  // Input fields
  const [title, setTitle] = useState(todoToEdit?.title ?? "");
  const [description, setDescription] = useState(todoToEdit?.description ?? "");
  const [type, setType] = useState<TodoType>(todoToEdit?.type ?? "standard");
  const [targetInput, setTargetInput] = useState(todoToEdit?.numbered?.target ? String(todoToEdit.numbered.target) : "5");

  // Strip Color Selection
  const [color, setColor] = useState<string>(() => todoToEdit?.color || "#5B8DEF");

  // Deadline selection
  const [deadlineMode, setDeadlineMode] = useState<"none" | "today" | "custom">(() => {
    if (!todoToEdit?.deadline) return "none";
    if (todoToEdit.deadline === todayStr) return "today";
    return "custom";
  });
  const [customDeadline, setCustomDeadline] = useState(
    todoToEdit?.deadline && todoToEdit.deadline !== todayStr ? todoToEdit.deadline : ""
  );
  const [postDeadlineAction, setPostDeadlineAction] = useState<"keep" | "disappear">(
    todoToEdit?.postDeadlineAction ?? "keep"
  );
  const [group, setGroup] = useState<string | null>(todoToEdit?.group ?? null);
  const [futureDate, setFutureDate] = useState(todoToEdit?.future ?? "");
  const [hasFutureDate, setHasFutureDate] = useState(todoToEdit ? !!todoToEdit.future : false);

  // Group creation state
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim() || isSubmitting || (deadlineMode === "custom" && !customDeadline)) return;

    setIsSubmitting(true);
    try {
      let finalGroup = group;
      if (group && group.startsWith("new_")) {
        if (newGroupName.trim()) {
          const sanitized = sanitizeGroupName(newGroupName);
          if (sanitized) {
            const lower = sanitized.toLowerCase();
            const existingGroup = groups.find((g) => sanitizeGroupName(g.name).toLowerCase() === lower);
            if (existingGroup) {
              finalGroup = existingGroup.id;
            } else {
              const created = await createGroup(sanitized, groups.length);
              finalGroup = created.id;
            }
          } else {
            finalGroup = null;
          }
        } else {
          finalGroup = null;
        }
      }

      let deadlineVal: string | null = null;
      if (deadlineMode === "today") {
        deadlineVal = todayStr;
      } else if (deadlineMode === "custom" && customDeadline) {
        deadlineVal = customDeadline;
      }

      const todoData: any = {
        title: sanitizeText(title, 200),
        description: description ? sanitizeText(description, 2000) : "",
        color: color || "#5B8DEF",
        deadline: deadlineVal,
        future: hasFutureDate && futureDate ? futureDate : null,
        group: finalGroup,
      };

      if (deadlineVal) {
        todoData.postDeadlineAction = postDeadlineAction;
      } else {
        todoData.postDeadlineAction = null;
      }

      if (type === "numbered") {
        const parsed = parseInt(targetInput, 10);
        const clampedTarget = isNaN(parsed) ? 5 : Math.max(2, Math.min(999, parsed));
        todoData.numbered = { 
          current: todoToEdit?.numbered ? todoToEdit.numbered.current : 0, 
          target: clampedTarget 
        };
      }

      // Signal parent to skip the next Tauri event re-fetch (onSuccess handles it)
      window.dispatchEvent(new CustomEvent("w:skip-todo-refresh"));

      if (todoToEdit) {
        await updateTodo(todoToEdit.id, todoData);
      } else {
        todoData.type = type;
        todoData.order = Date.now();
        // Default to enabled on desktop widget with random offset to prevent stacking overlaps
        const stagger = Math.floor(Math.random() * 8) * 20;
        todoData.stickyPosition = { x: 100 + stagger, y: 100 + stagger };
        await createTodo(todoData);
      }

      // Reset main input fields
      setTitle("");
      setDescription("");
      setColor("#5B8DEF");
      setDeadlineMode("none");
      setCustomDeadline("");
      setPostDeadlineAction("keep");
      setTargetInput("5");

      // Notify parent list to refresh
      if (onSuccess) onSuccess();
      // Auto close on success since we are in instant mode
      onClose();
    } catch (err) {
      console.error("Failed to save todo:", err);
      alert("Failed to save todo: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="todo-form todo-form--single">
      <div className="todo-form__header">
        <span className="t-label">[ TODO CREATOR ]</span>
        <button className="todo-form__close t-label" onClick={onClose} title="Close">
          [ X ]
        </button>
      </div>

      <form onSubmit={handleSubmit} className="todo-form__body">
        {/* Title input (Prompt style) */}
        <div className="todo-form__field todo-form__field--title">
          <span className="todo-form__prompt-char">&gt;</span>
          <input
            autoFocus
            className="todo-form__title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ENTER TODO TITLE..."
            disabled={isSubmitting}
          />
        </div>

        {/* Quick Notes/Details */}
        <div className="todo-form__field">
          <span className="t-meta">DETAILS (OPTIONAL)</span>
          <textarea
            className="todo-form__textarea t-body"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes, bullet points, or context..."
            disabled={isSubmitting}
          />
        </div>

        {/* Controls Grid: Task Type & Deadline */}
        <div className="todo-form__controls-grid">
          <div className="todo-form__field">
            <span className="t-meta">TASK TYPE</span>
            <div className="todo-form__selector-group">
              <button
                type="button"
                className={`todo-form__selector-btn ${type === "standard" ? "active" : ""}`}
                onClick={() => setType("standard")}
              >
                STANDARD
              </button>
              <button
                type="button"
                className={`todo-form__selector-btn ${type === "numbered" ? "active" : ""}`}
                onClick={() => setType("numbered")}
              >
                NUMBERED
              </button>
            </div>
          </div>

          <div className="todo-form__field">
            <span className="t-meta">DEADLINE</span>
            <div className="todo-form__selector-group">
              <button
                type="button"
                className={`todo-form__selector-btn ${deadlineMode === "none" ? "active" : ""}`}
                onClick={() => setDeadlineMode("none")}
              >
                NONE
              </button>
              <button
                type="button"
                className={`todo-form__selector-btn ${deadlineMode === "today" ? "active" : ""}`}
                onClick={() => setDeadlineMode("today")}
              >
                TODAY
              </button>
              <button
                type="button"
                className={`todo-form__selector-btn ${deadlineMode === "custom" ? "active" : ""}`}
                onClick={() => setDeadlineMode("custom")}
              >
                CUSTOM
              </button>
            </div>
          </div>
        </div>

        {/* Custom Deadline Input */}
        {deadlineMode === "custom" && (
          <div className="todo-form__field todo-form__field--deadline">
            <span className="t-meta">DEADLINE DATE</span>
            <DatePicker
              value={customDeadline}
              onChange={setCustomDeadline}
              min={getToday(undefined, dailyResetTime)}
              disabled={isSubmitting}
              placeholder="SELECT DEADLINE DATE..."
              dailyResetTime={dailyResetTime}
            />
            <span className="t-meta" style={{ color: "var(--text-muted)", marginTop: "4px" }}>
              Missing this deadline will issue a strike.
            </span>
          </div>
        )}

        {/* Post-Deadline Action Selection */}
        {deadlineMode !== "none" && (
          <div className="todo-form__field todo-form__field--post-action">
            <span className="t-meta">POST-DEADLINE ACTION</span>
            <div className="todo-form__selector-group">
              <button
                type="button"
                className={`todo-form__selector-btn ${postDeadlineAction === "keep" ? "active" : ""}`}
                onClick={() => setPostDeadlineAction("keep")}
                disabled={isSubmitting}
              >
                KEEP ON BOARD
              </button>
              <button
                type="button"
                className={`todo-form__selector-btn todo-form__selector-btn--urgent ${postDeadlineAction === "disappear" ? "active" : ""}`}
                onClick={() => setPostDeadlineAction("disappear")}
                disabled={isSubmitting}
              >
                VANISH FROM BOARD
              </button>
            </div>
          </div>
        )}

        {/* Numbered Repetitions Input */}
        {type === "numbered" && (
          <div className="todo-form__field todo-form__field--numbered">
            <span className="t-meta">TARGET REPETITIONS</span>
            <input
              type="number"
              min="2"
              max="999"
              className="todo-form__number-input t-data"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Strip Color Selection */}
        <div className="todo-form__field todo-form__field--color">
          <div className="todo-form__color-header">
            <span className="t-meta">STRIP COLOR</span>
            <span className="t-meta todo-form__color-preview-badge" style={{ color }}>
              [ {color.toUpperCase()} ]
            </span>
          </div>
          <div className="todo-form__color-grid">
            {TODO_STRIP_COLORS.map((c) => {
              const isSelected = color.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  className={`todo-form__color-btn ${isSelected ? "active" : ""}`}
                  style={{ "--swatch-color": c } as React.CSSProperties}
                  onClick={() => setColor(c)}
                  title={`Select strip color ${c}`}
                >
                  <span className="todo-form__color-dot" style={{ backgroundColor: c }} />
                </button>
              );
            })}

            {/* Custom Color Picker input */}
            <label className="todo-form__custom-color-wrap" title="Custom color picker">
              <input
                type="color"
                className="todo-form__custom-color-input"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <Pipette size={14} className="todo-form__pipette-icon" />
            </label>
          </div>
        </div>

        {/* Commencement Date Selector */}
        <div className="todo-form__field">
          <span className="t-meta">COMMENCEMENT</span>
          <div className="todo-form__selector-group">
            <button
              type="button"
              className={`todo-form__selector-btn ${!hasFutureDate ? "active" : ""}`}
              onClick={() => {
                setHasFutureDate(false);
                setFutureDate("");
              }}
              disabled={isSubmitting}
            >
              IMMEDIATE
            </button>
            <button
              type="button"
              className={`todo-form__selector-btn ${hasFutureDate ? "active" : ""}`}
              onClick={() => {
                setHasFutureDate(true);
                setFutureDate(futureDate || getToday(undefined, dailyResetTime));
              }}
              disabled={isSubmitting}
            >
              SCHEDULE START
            </button>
          </div>
        </div>

        {hasFutureDate && (
          <div className="todo-form__field todo-form__field--future">
            <span className="t-meta">START DATE</span>
            <DatePicker
              value={futureDate || getToday(undefined, dailyResetTime)}
              onChange={setFutureDate}
              min={getToday(undefined, dailyResetTime)}
              disabled={isSubmitting}
              placeholder="SELECT START DATE..."
              dailyResetTime={dailyResetTime}
            />
          </div>
        )}

        {/* Group Selection (Sleek inline tags) */}
        <div className="todo-form__field">
          <span className="t-meta">GROUP CATEGORY</span>
          <div className="todo-form__groups-row">
            <button
              type="button"
              className={`todo-form__group-tag ${group === null && !isCreatingGroup ? "active" : ""}`}
              onClick={() => {
                setGroup(null);
                setIsCreatingGroup(false);
                setNewGroupName("");
              }}
            >
              [ NONE ]
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`todo-form__group-tag ${group === g.id && !isCreatingGroup ? "active" : ""}`}
                onClick={() => {
                  setGroup(g.id);
                  setIsCreatingGroup(false);
                  setNewGroupName("");
                }}
              >
                {`[ ${g.name.toUpperCase()} ]`}
              </button>
            ))}
            <button
              type="button"
              className={`todo-form__group-tag ${isCreatingGroup ? "active" : ""}`}
              onClick={() => {
                setIsCreatingGroup(true);
                if (newGroupName.trim()) {
                  setGroup(`new_${newGroupName.trim().toLowerCase().replace(/\s+/g, "_")}`);
                } else {
                  setGroup(null);
                }
              }}
            >
              [ + NEW ]
            </button>
          </div>
        </div>

        {isCreatingGroup && (
          <div className="todo-form__field todo-form__field--new-group">
            <input
              type="text"
              className="todo-form__new-group-input t-body"
              placeholder="Type new group name..."
              value={newGroupName}
              onChange={(e) => {
                setNewGroupName(e.target.value);
                setGroup(`new_${e.target.value.toLowerCase().replace(/\s+/g, "_")}`);
              }}
              autoFocus
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Action Row */}
        <div className="todo-form__action-row">
          <button type="button" className="btn-action btn-action--secondary" onClick={onClose}>
            [ CANCEL ]
          </button>
          <button
            type="submit"
            className="btn-action btn-action--primary"
            disabled={isSubmitting || !title.trim() || (deadlineMode === "custom" && !customDeadline) || (hasFutureDate && !futureDate)}
          >
            {todoToEdit ? "[ SAVE CHANGES ]" : "[ CREATE TODO ]"}
          </button>
        </div>
      </form>
    </div>
  );
}

