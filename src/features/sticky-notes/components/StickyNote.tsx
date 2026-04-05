import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Todo } from "../../todos/types";
import { getToday } from "../../../shared/utils/dateUtils";
import { enableCursorEvents, disableCursorEvents } from "./StickyCanvas";
import "./StickyNote.css";

interface StickyNoteProps {
  todo: Todo;
  position: { x: number; y: number };
  onDragEnd: (todoId: string, pos: { x: number; y: number }) => void;
  onComplete: (todoId: string) => void;
  onIncrement: (todoId: string) => void;
  onFullComplete: (todoId: string) => void;
}

export function StickyNote({
  todo,
  position,
  onDragEnd,
  onComplete,
  onIncrement,
  onFullComplete,
}: StickyNoteProps) {
  const [pos, setPos] = useState(position);
  const [isDragging, setIsDragging] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const dragStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const holdTimeoutRef = useRef<number | null>(null);
  const hasMovedRef = useRef(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<number | null>(null);

  const HOLD_DURATION = 500;

  // Sync external position changes
  useEffect(() => {
    if (!isDragging) {
      setPos(position);
    }
  }, [position, isDragging]);

  // ─── Drag Handlers ──────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    hasMovedRef.current = false;

    // Track click count for double-click detection
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickCountRef.current = 0;
    }, 400);

    const isDoubleClick = clickCountRef.current >= 2;

    // Start hold timer
    setIsHolding(true);
    holdTimeoutRef.current = window.setTimeout(() => {
      // Hold completed — determine action
      if (isDoubleClick && todo.type === "numbered") {
        // Double-click-and-hold → full complete
        triggerCompletion(() => onFullComplete(todo.id));
      } else if (todo.type === "numbered") {
        // Single hold → increment
        onIncrement(todo.id);
        setIsHolding(false);
      } else {
        // Standard → complete
        triggerCompletion(() => onComplete(todo.id));
      }
    }, HOLD_DURATION);
  }, [pos, todo, onComplete, onIncrement, onFullComplete]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // Only start dragging after 5px movement threshold
    if (!hasMovedRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      hasMovedRef.current = true;
      setIsDragging(true);
      // Cancel hold when dragging starts
      cancelHold();
    }

    if (hasMovedRef.current) {
      const newX = Math.max(0, Math.min(window.innerWidth - 150, dragStartRef.current.originX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - 60, dragStartRef.current.originY + dy));
      setPos({ x: newX, y: newY });
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    if (isDragging) {
      onDragEnd(todo.id, pos);
    }

    cancelHold();
    setIsDragging(false);
    dragStartRef.current = null;
  }, [isDragging, pos, todo.id, onDragEnd]);

  const cancelHold = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    setIsHolding(false);
  };

  const triggerCompletion = (callback: () => void) => {
    setIsHolding(false);
    setIsCompleting(true);
    // Run animation, then callback
    setTimeout(() => {
      callback();
    }, 500); // matches CSS animation duration
  };

  useEffect(() => {
    return () => {
      cancelHold();
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  // ─── Render Data ────────────────────────────────────────────────
  const today = getToday();
  let deadlineText: string | null = null;
  let isOverdue = false;

  if (todo.deadline) {
    if (todo.deadline < today) {
      deadlineText = "OVERDUE";
      isOverdue = true;
    } else if (todo.deadline === today) {
      deadlineText = "TODAY";
    } else {
      // Calculate days remaining
      const deadlineDate = new Date(todo.deadline + "T12:00:00");
      const todayDate = new Date(today + "T12:00:00");
      const diffDays = Math.ceil((deadlineDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      deadlineText = `${diffDays}D`;
    }
  }

  let progressPercent = 0;
  if (todo.type === "numbered" && todo.numbered) {
    progressPercent = Math.min(100, (todo.numbered.current / todo.numbered.target) * 100);
  }

  const cardStyle = {
    "--card-accent": todo.color,
    left: `${pos.x}px`,
    top: `${pos.y}px`,
  } as React.CSSProperties;

  const className = [
    "sticky-note",
    isDragging && "sticky-note--dragging",
    isHolding && "sticky-note--holding",
    isCompleting && "sticky-note--completing",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={className}
      style={cardStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={enableCursorEvents}
      onMouseLeave={disableCursorEvents}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Hold fill overlay */}
      <AnimatePresence>
        {isHolding && !isCompleting && (
          <motion.div
            className="sticky-note__fill"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            exit={{ width: "0%", transition: { duration: 0.1 } }}
            transition={{ duration: HOLD_DURATION / 1000, ease: "linear" }}
          />
        )}
      </AnimatePresence>

      <div className="sticky-note__title">{todo.title}</div>

      {(deadlineText || (todo.type === "numbered" && todo.numbered)) && (
        <div className="sticky-note__badges">
          {deadlineText && (
            <span className={`sticky-note__badge ${isOverdue ? "sticky-note__badge--overdue" : "sticky-note__badge--deadline"}`}>
              ⏰ {deadlineText}
            </span>
          )}
          {todo.type === "numbered" && todo.numbered && (
            <span className="sticky-note__badge sticky-note__badge--numbered">
              {todo.numbered.current}/{todo.numbered.target}
            </span>
          )}
        </div>
      )}

      {todo.type === "numbered" && todo.numbered && (
        <div className="sticky-note__progress">
          <div
            className="sticky-note__progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
