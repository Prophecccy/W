import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Todo } from "../../types";
import { LucideIcon } from "../../../../shared/components/IconPicker/LucideIcon";
import { getToday } from "../../../../shared/utils/dateUtils";
import "./TodoCard.css";

interface TodoCardProps {
  todo: Todo;
  onComplete: () => void;
  onClick: () => void;
}

export function TodoCard({ todo, onComplete, onClick }: TodoCardProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [completeTriggered, setCompleteTriggered] = useState(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const hasHeldRef = useRef(false);

  const HOLD_DURATION = 500; // ms to hold to complete
  const isCompleted = todo.status === "done";

  const cardStyle = {
    "--card-accent": todo.color,
  } as React.CSSProperties;

  // ─── Interaction Handlers ───────────────────────────────────────
  const startHold = () => {
    if (isCompleted) return;
    
    setIsHolding(true);
    setCompleteTriggered(false);
    hasHeldRef.current = false;
    
    holdTimeoutRef.current = window.setTimeout(() => {
      setCompleteTriggered(true);
      setIsHolding(false);
      hasHeldRef.current = true;
      onComplete();
    }, HOLD_DURATION);
  };

  const cancelHold = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    setIsHolding(false);
  };

  useEffect(() => {
    return cancelHold;
  }, []);

  const handlePointerUp = () => {
    cancelHold();
    if (!hasHeldRef.current) {
      onClick();
    }
  };

  // ─── Render Logic ───────────────────────────────────────────────
  
  // Calculate days left for deadline
  let deadlineText = null;
  if (todo.deadline && !isCompleted) {
    const today = getToday();
    if (todo.deadline < today) {
      deadlineText = "OVERDUE";
    } else if (todo.deadline === today) {
      deadlineText = "DUE TODAY";
    } else {
      // Just showing the raw date for now, could calculate diff
      deadlineText = `DUE ${todo.deadline}`;
    }
  }

  // Calculate numbered progress
  let progressPercent = 0;
  if (todo.type === "numbered" && todo.numbered) {
    progressPercent = Math.min(100, (todo.numbered.current / todo.numbered.target) * 100);
  }

  return (
    <div
      className={`todo-card ${isCompleted ? "todo-card--completed" : ""} ${isHolding ? "todo-card--holding" : ""}`}
      style={cardStyle}
      onPointerDown={startHold}
      onPointerUp={handlePointerUp}
      onPointerLeave={cancelHold}
      onContextMenu={(e) => {
         e.preventDefault();
      }}
    >
      <AnimatePresence>
        {isHolding && !completeTriggered && (
          <motion.div
            className="todo-card__fill"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            exit={{ width: "0%", transition: { duration: 0.1 } }}
            transition={{ duration: HOLD_DURATION / 1000, ease: "linear" }}
          />
        )}
      </AnimatePresence>

      <div className="todo-card__content">
        <div className="todo-card__header">
          <div className="todo-card__title-group">
            <LucideIcon
              name="CheckCircle"
              size={20}
              className="todo-card__icon"
              style={{ color: isCompleted ? "var(--text-muted)" : "var(--card-accent)" }}
            />
            <span className="todo-card__title t-body">{todo.title}</span>
          </div>
        </div>

        <div className="todo-card__footer">
          <div className="todo-card__badges">
            <span className="badge t-meta">[ {todo.type.toUpperCase()} ]</span>
            {deadlineText && (
               <span className="badge t-meta" style={{ color: deadlineText === "OVERDUE" ? "var(--strike-red)" : "var(--text-secondary)" }}>
                  [ {deadlineText} ]
               </span>
            )}
            {todo.future && (
               <span className="badge t-meta">[ STARTS {todo.future} ]</span>
            )}
          </div>

          {todo.type === "numbered" && todo.numbered && (
            <div className="todo-card__progress-display t-meta">
              <span>{todo.numbered.current}/{todo.numbered.target}</span>
            </div>
          )}
          
          {isCompleted && (
             <div className="todo-card__complete-check">
               <LucideIcon name="Check" size={16} />
             </div>
          )}
        </div>
      </div>

      {todo.type === "numbered" && todo.numbered && (
         <div className="todo-card__progress-track">
            <div 
               className="todo-card__progress-fill" 
               style={{ width: `${progressPercent}%` }}
            />
         </div>
      )}
    </div>
  );
}
