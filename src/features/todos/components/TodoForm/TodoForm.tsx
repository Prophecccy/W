import { useState } from "react";
import { Todo, TodoType, TodoPriority, PRIORITY_CONFIG } from "../../types";
import { createTodo, updateTodo } from "../../services/todoService";
import { HabitGroup } from "../../../habits/types";
import { createGroup, sanitizeGroupName } from "../../../habits/services/groupService";
import { getToday } from "../../../../shared/utils/dateUtils";
import { sanitizeText } from "../../../../shared/utils/security";
import { DatePicker } from "../../../../shared/components/DatePicker/DatePicker";
import "./TodoForm.css";

interface TodoFormProps {
  onClose: () => void;
  onSuccess?: () => void;
  groups?: HabitGroup[];
  dailyResetTime?: string;
  todoToEdit?: Todo;
}

function getInitialPriority(todoToEdit?: Todo): TodoPriority {
  if (todoToEdit?.priority) return todoToEdit.priority;
  if (!todoToEdit) return "p3";
  const c = todoToEdit.color?.toLowerCase();
  if (c === "#ff4d4d" || c === "#ef4444") return "p1";
  if (c === "#f59e0b" || c === "#facc15" || c === "#f97316") return "p2";
  if (c === "#6b7280" || c === "#71717a" || c === "#888888") return "p4";
  return "p3";
}

export function TodoForm({ onClose, onSuccess, groups = [], dailyResetTime, todoToEdit }: TodoFormProps) {
  const todayStr = getToday(undefined, dailyResetTime);

  // Input fields
  const [title, setTitle] = useState(todoToEdit?.title ?? "");
  const [description, setDescription] = useState(todoToEdit?.description ?? "");
  const [type, setType] = useState<TodoType>(todoToEdit?.type ?? "standard");
  const [targetInput, setTargetInput] = useState(todoToEdit?.numbered?.target ? String(todoToEdit.numbered.target) : "5");

  // Priority Hierarchy (P1 to P4)
  const [priority, setPriority] = useState<TodoPriority>(() => getInitialPriority(todoToEdit));

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

  const handleSelectPriority = (newPriority: TodoPriority) => {
    setPriority(newPriority);
    // P1 Critical: Non-negotiable priorities for today. If deadline not set, auto-suggest today.
    if (newPriority === "p1" && deadlineMode === "none") {
      setDeadlineMode("today");
    }
  };

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
        color: PRIORITY_CONFIG[priority].color,
        priority: priority,
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
      setPriority("p3");
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

        {/* Priority Hierarchy (P1 to P4) */}
        <div className="todo-form__field todo-form__field--priority">
          <div className="todo-form__priority-header">
            <span className="t-meta">PRIORITY HIERARCHY</span>
            <span
              className="t-meta todo-form__priority-badge"
              style={{ color: PRIORITY_CONFIG[priority].color }}
            >
              [ {PRIORITY_CONFIG[priority].label} ]
            </span>
          </div>
          <div className="todo-form__priority-grid">
            {(["p1", "p2", "p3", "p4"] as TodoPriority[]).map((tierKey) => {
              const tier = PRIORITY_CONFIG[tierKey];
              const isSelected = priority === tierKey;
              return (
                <button
                  key={tierKey}
                  type="button"
                  className={`todo-form__priority-btn todo-form__priority-btn--${tierKey} ${isSelected ? "active" : ""}`}
                  style={{ "--tier-color": tier.color } as React.CSSProperties}
                  onClick={() => handleSelectPriority(tierKey)}
                  title={tier.description}
                >
                  <span className="todo-form__priority-dot" style={{ backgroundColor: tier.color }} />
                  <span className="todo-form__priority-label">{tier.label}</span>
                </button>
              );
            })}
          </div>
          <p className="todo-form__priority-desc t-meta">
            {PRIORITY_CONFIG[priority].description}
          </p>
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

