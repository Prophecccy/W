import { useState } from "react";
import { TodoType } from "../../types";
import { createTodo } from "../../services/todoService";
import { HabitGroup } from "../../../habits/types";
import { createGroup, sanitizeGroupName } from "../../../habits/services/groupService";
import { getToday } from "../../../../shared/utils/dateUtils";
import { DatePicker } from "../../../../shared/components/DatePicker/DatePicker";
import "./TodoForm.css";

interface TodoFormProps {
  onClose: () => void;
  onSuccess?: () => void;
  groups?: HabitGroup[];
  dailyResetTime?: string;
}

export function TodoForm({ onClose, onSuccess, groups = [], dailyResetTime }: TodoFormProps) {
  // Input fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TodoType>("standard");
  const [targetInput, setTargetInput] = useState("5");
  const [isUrgent, setIsUrgent] = useState(false);
  const [hasCustomDeadline, setHasCustomDeadline] = useState(false);
  const [customDeadline, setCustomDeadline] = useState("");
  const [postDeadlineAction, setPostDeadlineAction] = useState<"keep" | "disappear">("keep");
  const [group, setGroup] = useState<string | null>(null);

  // Group creation state
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim() || isSubmitting || (hasCustomDeadline && !customDeadline)) return;

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

      const todayStr = getToday(undefined, dailyResetTime);
      let deadlineVal: string | null = null;
      if (isUrgent) {
        deadlineVal = todayStr;
      } else if (hasCustomDeadline && customDeadline) {
        deadlineVal = customDeadline;
      }

      const todoData: Parameters<typeof createTodo>[0] = {
        title: title.trim(),
        description: description.trim(),
        type,
        color: isUrgent ? "#ff4d4d" : "#5B8DEF",
        order: Date.now(),
        deadline: deadlineVal,
        future: null,
        group: finalGroup,
      };

      if (isUrgent || (hasCustomDeadline && customDeadline)) {
        todoData.postDeadlineAction = postDeadlineAction;
      }

      if (type === "numbered") {
        const parsed = parseInt(targetInput, 10);
        const clampedTarget = isNaN(parsed) ? 5 : Math.max(2, Math.min(999, parsed));
        todoData.numbered = { current: 0, target: clampedTarget };
      }

      // Default to enabled on desktop widget with random offset to prevent stacking overlaps
      const stagger = Math.floor(Math.random() * 8) * 20;
      todoData.stickyPosition = { x: 100 + stagger, y: 100 + stagger };

      await createTodo(todoData);

      // Reset main input fields
      setTitle("");
      setDescription("");
      setIsUrgent(false);
      setHasCustomDeadline(false);
      setCustomDeadline("");
      setPostDeadlineAction("keep");
      setTargetInput("5");

      // Notify parent list to refresh
      if (onSuccess) onSuccess();
      // Auto close on success since we are in instant mode
      onClose();
    } catch (err) {
      console.error("Failed to create todo:", err);
      alert("Failed to create todo: " + (err instanceof Error ? err.message : String(err)));
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

        {/* Controls Grid: Type & Priority (Sleek text segments) */}
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
            <span className="t-meta">PRIORITY</span>
            <div className="todo-form__selector-group">
              <button
                type="button"
                className={`todo-form__selector-btn ${!isUrgent && !hasCustomDeadline ? "active" : ""}`}
                onClick={() => {
                  setIsUrgent(false);
                  setHasCustomDeadline(false);
                }}
              >
                NORMAL
              </button>
              <button
                type="button"
                className={`todo-form__selector-btn todo-form__selector-btn--urgent ${isUrgent ? "active" : ""}`}
                onClick={() => {
                  setIsUrgent(true);
                  setHasCustomDeadline(false);
                }}
              >
                URGENT
              </button>
              <button
                type="button"
                className={`todo-form__selector-btn ${hasCustomDeadline ? "active" : ""}`}
                onClick={() => {
                  setIsUrgent(false);
                  setHasCustomDeadline(true);
                }}
              >
                CUSTOM
              </button>
            </div>
          </div>
        </div>

        {/* Custom Deadline Input */}
        {hasCustomDeadline && (
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
        {(isUrgent || hasCustomDeadline) && (
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
            disabled={isSubmitting || !title.trim() || (hasCustomDeadline && !customDeadline)}
          >
            [ CREATE TODO ]
          </button>
        </div>
      </form>
    </div>
  );
}

