import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Todo, PRIORITY_CONFIG, TodoPriority } from "../../types";
import { LucideIcon } from "../../../../shared/components/IconPicker/LucideIcon";
import { getToday } from "../../../../shared/utils/dateUtils";
import { SPRING_LAYOUT, SPRING_POP } from "../../../../shared/constants/motion";
import { useSpotlightBorder } from "../../../../shared/hooks/useSpotlightBorder";
import { playMechanicalClick, playSubtleThud, playHoldHum, stopHoldHum } from "../../../../shared/services/tactileAudioService";
import "./TodoCard.css";

interface TodoCardProps {
  todo: Todo;
  onComplete: () => void;
  onClick: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onToggleExpand?: () => void;
  expanded?: boolean;
  dailyResetTime?: string;
}

function getTodoPriority(todo: Todo): TodoPriority {
  if (todo.priority && PRIORITY_CONFIG[todo.priority]) {
    return todo.priority;
  }
  const hex = (todo.color || "").toLowerCase();
  if (hex === "#ef4444" || hex === "#ff4d4d") return "p1";
  if (hex === "#f59e0b" || hex === "#facc15") return "p2";
  if (hex === "#6b7280" || hex === "#71717a") return "p4";
  return "p3";
}

export function TodoCard({ 
  todo, 
  onComplete, 
  onClick, 
  onDelete, 
  onEdit,
  onToggleExpand,
  expanded = false,
  dailyResetTime
}: TodoCardProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [completeTriggered, setCompleteTriggered] = useState(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const hasHeldRef = useRef(false);
  const pointerStartCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const spotlight = useSpotlightBorder<HTMLDivElement>();

  const HOLD_DURATION = 500; // ms to hold to complete
  const isCompleted = todo.status === "done";
  const isClickable = todo.type === "numbered" || (!!todo.description && todo.description.trim() !== "");

  const priorityTier = getTodoPriority(todo);
  const priorityInfo = PRIORITY_CONFIG[priorityTier];

  const cardStyle = {
    "--card-accent": todo.color || priorityInfo.color,
    cursor: isClickable ? "pointer" : "default",
  } as React.CSSProperties;

  // ─── Interaction Handlers ───────────────────────────────────────
  const startHold = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isCompleted) return;
    if (e.button !== 0) return;

    // Cancel any existing running hold first to ensure double-tap safety
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    // Keep track of the initial touch coordinate to prevent scroll/drag completion collisions
    pointerStartCoordsRef.current = { x: e.clientX, y: e.clientY };
    
    setIsHolding(true);
    setCompleteTriggered(false);
    hasHeldRef.current = false;
    playHoldHum();
    
    holdTimeoutRef.current = window.setTimeout(() => {
      stopHoldHum();
      setCompleteTriggered(true);
      setIsHolding(false);
      hasHeldRef.current = true;
      playMechanicalClick();
      onComplete();
    }, HOLD_DURATION);
  };

  const cancelHold = () => {
    stopHoldHum();
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    setIsHolding(false);
    pointerStartCoordsRef.current = null;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    spotlight.onPointerMove(e);
    if (!isHolding || !pointerStartCoordsRef.current) return;
    
    const deltaX = Math.abs(e.clientX - pointerStartCoordsRef.current.x);
    const deltaY = Math.abs(e.clientY - pointerStartCoordsRef.current.y);
    
    // If the pointer has drifted by more than 15px, cancel the hold immediately!
    if (deltaX > 15 || deltaY > 15) {
      cancelHold();
    }
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    spotlight.onPointerLeave(e);
    cancelHold();
  };

  useEffect(() => {
    return cancelHold;
  }, []);

  const handlePointerUp = () => {
    const shouldClick = !hasHeldRef.current && pointerStartCoordsRef.current !== null;
    cancelHold();
    if (shouldClick && isClickable) {
      onClick();
    }
  };

  // ─── Render Logic ───────────────────────────────────────────────
  
  // Calculate days left for deadline
  let deadlineText = null;
  if (todo.deadline && !isCompleted) {
    const today = getToday(undefined, dailyResetTime);
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
    <motion.div
      layout
      transition={SPRING_LAYOUT}
      whileTap={{ scale: 0.98 }}
      className={`todo-card ${isCompleted ? "todo-card--completed" : ""} ${isHolding ? "todo-card--holding" : ""}`}
      style={cardStyle}
      onPointerEnter={spotlight.onPointerEnter}
      onPointerDown={startHold}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
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
            transition={{ duration: HOLD_DURATION / 1000, ease: [0.32, 0, 0.67, 1] }}
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
            {todo.description && todo.description.trim() !== "" && (
              <button
                type="button"
                className="todo-card__expand-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand?.();
                }}
                title={expanded ? "Collapse description" : "Expand description"}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "2px",
                  marginLeft: "6px"
                }}
              >
                <LucideIcon name={expanded ? "ChevronUp" : "ChevronDown"} size={14} />
              </button>
            )}
          </div>
          <div className="todo-card__actions" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {onEdit && !isCompleted && (
              <button
                type="button"
                className="todo-card__edit-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                title="Edit Todo"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px"
                }}
              >
                <LucideIcon name="Pencil" size={14} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="todo-card__delete-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  playSubtleThud();
                  onDelete();
                }}
                title="Delete Todo"
              >
                <LucideIcon name="Trash2" size={14} />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && todo.description && (
            <motion.div
              className="todo-card__description t-body"
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: 8 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={SPRING_LAYOUT}
              style={{ overflow: "hidden", color: "var(--text-secondary)" }}
            >
              {todo.description}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="todo-card__footer">
          <div className="todo-card__badges">
            <span
              className="badge t-meta todo-card__priority-badge"
              style={{ color: priorityInfo.color }}
            >
              [ {priorityInfo.shortLabel} ]
            </span>
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
             <motion.div 
               className="todo-card__complete-check"
               initial={{ scale: 0, rotate: -20, opacity: 0 }}
               animate={{ scale: 1, rotate: 0, opacity: 1 }}
               transition={SPRING_POP}
             >
               <LucideIcon name="Check" size={16} />
             </motion.div>
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
    </motion.div>
  );
}
