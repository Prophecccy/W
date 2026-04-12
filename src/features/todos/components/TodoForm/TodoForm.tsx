import { useState } from "react";
import { TodoType } from "../../types";
import { createTodo } from "../../services/todoService";
import { HabitGroup } from "../../habits/types";
import { ColorPicker } from "../../../../shared/components/ColorPicker/ColorPicker";
import "./TodoForm.css";

interface TodoFormProps {
  onClose: () => void;
  onSuccess?: () => void;
  groups?: HabitGroup[];
}

export function TodoForm({ onClose, onSuccess, groups = [] }: TodoFormProps) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TodoType>("standard");
  const [target, setTarget] = useState(5);
  const [color, setColor] = useState("#5B8DEF");
  const [deadline, setDeadline] = useState("");
  const [future, setFuture] = useState("");
  const [showOnDesktop, setShowOnDesktop] = useState(true);
  const [group, setGroup] = useState<string | null>(null);
  
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalSteps = 5;

  const handleNext = () => setStep((s) => Math.min(s + 1, totalSteps));
  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      const todoData: Parameters<typeof createTodo>[0] = {
        title,
        description,
        type,
        color,
        order: 0,
        deadline: deadline || null,
        future: future || null,
        group,
      };
      if (type === "numbered") {
        todoData.numbered = { current: 0, target };
      }
      if (showOnDesktop) {
        todoData.stickyPosition = { x: 100, y: 100 };
      }
      await createTodo(todoData);
      if (onSuccess) onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="todo-form">
      <div className="todo-form__header">
        <span className="t-meta">[ NEW TODO ]</span>
        <button className="todo-form__close t-label" onClick={onClose}>
          [ X ]
        </button>
      </div>

      <div className="todo-form__content">
        {step === 1 && (
          <div className="todo-form__step">
            <span className="t-label">STEP 1: BASICS</span>
            <div className="todo-form__field">
              <span className="t-meta">TITLE</span>
              <input
                autoFocus
                className="todo-form__input t-body"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
              />
            </div>
            <div className="todo-form__field">
              <span className="t-meta">NOTES (OPTIONAL)</span>
              <textarea
                className="todo-form__input todo-form__textarea t-body"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details..."
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="todo-form__step">
            <span className="t-label">STEP 2: TYPE</span>
            <div className="todo-form__radio-group">
              <button
                className={`todo-form__radio-btn ${type === "standard" ? "todo-form__radio-btn--active" : ""}`}
                onClick={() => setType("standard")}
              >
                <div className="t-label mb-1">STANDARD</div>
                <span className="t-meta">One-off task. Complete it once and it's done.</span>
              </button>
              <button
                className={`todo-form__radio-btn ${type === "numbered" ? "todo-form__radio-btn--active" : ""}`}
                onClick={() => setType("numbered")}
              >
                <div className="t-label mb-1">NUMBERED</div>
                <span className="t-meta">Requires multiple steps or reps to complete.</span>
              </button>
            </div>

            {type === "numbered" && (
              <div className="todo-form__field mt-4">
                <span className="t-meta">TARGET VALUE</span>
                <input
                  type="number"
                  min="2"
                  max="999"
                  className="todo-form__input t-data"
                  value={target}
                  onChange={(e) => setTarget(parseInt(e.target.value) || 5)}
                />
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="todo-form__step">
            <span className="t-label">STEP 3: SCHEDULING (OPTIONAL)</span>
            <div className="todo-form__field">
              <span className="t-meta">DEADLINE</span>
              <input
                type="date"
                className="todo-form__input t-data"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              <span className="t-meta" style={{color: "var(--text-muted)", marginTop: "4px"}}>
                Missing this will issue a strike.
              </span>
            </div>
            <div className="todo-form__field mt-4">
              <span className="t-meta">START DATE (FUTURE)</span>
              <input
                type="date"
                className="todo-form__input t-data"
                value={future}
                onChange={(e) => setFuture(e.target.value)}
              />
              <span className="t-meta" style={{color: "var(--text-muted)", marginTop: "4px"}}>
                Hides the todo until this date.
              </span>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="todo-form__step">
            <span className="t-label">STEP 4: APPEARANCE</span>
            <div className="todo-form__field">
              <span className="t-meta">ACCENT COLOR</span>
              <ColorPicker selectedColor={color} onSelect={setColor} />
            </div>

            <div className="todo-form__field mt-4">
              <span className="t-meta">DESKTOP WIDGET</span>
              <button
                className={`todo-form__radio-btn ${showOnDesktop ? "todo-form__radio-btn--active" : ""}`}
                onClick={() => setShowOnDesktop(!showOnDesktop)}
              >
                <div className="t-label">{showOnDesktop ? "[ ENABLED ]" : "[ DISABLED ]"}</div>
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="todo-form__step">
            <span className="t-label">STEP 5: GROUPING (OPTIONAL)</span>
            <div className="todo-form__radio-group mt-4">
              <button
                className={`todo-form__radio-btn ${group === null && !isCreatingGroup ? "todo-form__radio-btn--active" : ""}`}
                onClick={() => { setGroup(null); setIsCreatingGroup(false); }}
              >
                <div className="t-label">NO GROUP</div>
              </button>
              
              {groups.map(g => (
                <button
                  key={g.id}
                  className={`todo-form__radio-btn ${group === g.id && !isCreatingGroup ? "todo-form__radio-btn--active" : ""}`}
                  onClick={() => { setGroup(g.id); setIsCreatingGroup(false); }}
                >
                  <div className="t-label">{g.name.toUpperCase()}</div>
                </button>
              ))}

              <button
                className={`todo-form__radio-btn ${isCreatingGroup ? "todo-form__radio-btn--active" : ""}`}
                onClick={() => setIsCreatingGroup(true)}
              >
                <div className="t-label">+ NEW GROUP</div>
              </button>
            </div>

            {isCreatingGroup && (
              <div className="todo-form__field mt-4">
                <input 
                  type="text" 
                  className="todo-form__input t-body" 
                  placeholder="New Group Name" 
                  value={newGroupName} 
                  onChange={e => {
                    setNewGroupName(e.target.value);
                    setGroup(`new_${e.target.value.toLowerCase().replace(/\s+/g, '_')}`);
                  }}
                  autoFocus
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="todo-form__footer">
        {step > 1 ? (
          <button className="todo-form__btn t-label" onClick={handlePrev}>
            [ BACK ]
          </button>
        ) : (
          <div /> // spacer
        )}

        {step < totalSteps ? (
          <button
            className="todo-form__btn todo-form__btn--primary t-label"
            onClick={handleNext}
            disabled={step === 1 && !title.trim()}
          >
            [ NEXT ]
          </button>
        ) : (
          <button
            className="todo-form__btn todo-form__btn--primary t-label"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            [ CREATE TODO ]
          </button>
        )}
      </div>
    </div>
  );
}
