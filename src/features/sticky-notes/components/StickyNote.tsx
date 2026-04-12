import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { Todo } from "../../todos/types";
import { getToday } from "../../../shared/utils/dateUtils";
import { forceInteractive, sendStickyRegions } from "./StickyCanvas";

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
  const [isHolding, setIsHolding] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const noteRef = useRef<HTMLDivElement>(null);
  const livePosRef = useRef(position);
  const holdTimeoutRef = useRef<number | null>(null);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<number | null>(null);

  const HOLD_DURATION = 500;

  // Sync external position changes
  useEffect(() => {
    setPos(position);
    livePosRef.current = position;
  }, [position]);

  // ─── FULLY NATIVE drag system ─────────────────────────────────
  // Bypasses React synthetic events entirely for maximum performance.
  // Uses window-level listeners (no pointer capture needed) with
  // requestAnimationFrame throttling.
  useEffect(() => {
    const el = noteRef.current;
    if (!el) return;

    let dragStart: { x: number; y: number; ox: number; oy: number } | null = null;
    let hasMoved = false;
    let latestDx = 0;
    let latestDy = 0;
    let rafId: number | null = null;

    const applyTransform = () => {
      if (el) {
        el.style.transform = `translate(${latestDx}px, ${latestDy}px)`;
      }
      rafId = null;
    };

    const onMove = (e: PointerEvent) => {
      if (!dragStart) return;

      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      // 5px threshold to start drag
      if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        hasMoved = true;
        // Direct DOM class manipulation — no React re-render
        el.classList.add("sticky-note--dragging");
        // Cancel hold
        cancelHold();
        // Tell Rust to keep overlay interactive
        invoke("set_sticky_drag_mode", { dragging: true }).catch(() => {});
      }

      if (hasMoved) {
        // Clamp to viewport
        const maxDx = window.innerWidth - 150 - dragStart.ox;
        const minDx = -dragStart.ox;
        const maxDy = window.innerHeight - 60 - dragStart.oy;
        const minDy = -dragStart.oy;
        latestDx = Math.max(minDx, Math.min(maxDx, dx));
        latestDy = Math.max(minDy, Math.min(maxDy, dy));

        // RAF throttle: max 1 DOM write per frame
        if (rafId === null) {
          rafId = requestAnimationFrame(applyTransform);
        }

        // Update ref for final position
        livePosRef.current = {
          x: dragStart.ox + latestDx,
          y: dragStart.oy + latestDy,
        };
      }
    };

    const onUp = (_e: PointerEvent) => {
      // Remove window listeners immediately
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      // Cancel any pending RAF
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      if (hasMoved) {
        const finalPos = livePosRef.current;

        // CRITICAL ORDER: Apply these while .sticky-note--dragging
        // is still present (transition: none !important is active).
        // 1. Set final left/top
        el.style.left = `${finalPos.x}px`;
        el.style.top = `${finalPos.y}px`;
        // 2. Clear the drag transform
        el.style.transform = "";
        // 3. Force the browser to paint NOW, before we re-enable transitions.
        //    Without this, the browser batches the transform removal and
        //    class removal together, causing `transition: transform 0.1s`
        //    to animate the transform change = the visible "shake".
        void el.offsetHeight;
        // 4. NOW safe to remove the class (transitions re-enable, but
        //    transform is already at its final value so nothing animates)
        el.classList.remove("sticky-note--dragging");

        // Sync React state (single re-render)
        setPos(finalPos);
        onDragEnd(todo.id, finalPos);

        // Update Rust hit-test regions
        requestAnimationFrame(() => {
          const notes = document.querySelectorAll(".sticky-note");
          const regions: Array<{ left: number; top: number; right: number; bottom: number }> = [];
          notes.forEach((n) => {
            const r = n.getBoundingClientRect();
            const dpr = window.devicePixelRatio;
            regions.push({
              left: Math.round(r.left * dpr),
              top: Math.round(r.top * dpr),
              right: Math.round(r.right * dpr),
              bottom: Math.round(r.bottom * dpr),
            });
          });
          sendStickyRegions(regions);
        });

        invoke("set_sticky_drag_mode", { dragging: false }).catch(() => {});
      }

      cancelHold();
      dragStart = null;
      hasMoved = false;
      latestDx = 0;
      latestDy = 0;
    };

    const onDown = (e: PointerEvent) => {
      // Ensure overlay is interactive
      forceInteractive();

      dragStart = {
        x: e.clientX,
        y: e.clientY,
        ox: livePosRef.current.x,
        oy: livePosRef.current.y,
      };
      hasMoved = false;

      // Attach window-level listeners for reliable tracking
      // (no pointer capture needed — works better in WebView2)
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);

      // ─── Hold / click detection ────────────────────
      clickCountRef.current += 1;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = window.setTimeout(() => {
        clickCountRef.current = 0;
      }, 400);

      const isDoubleClick = clickCountRef.current >= 2;

      setIsHolding(true);
      holdTimeoutRef.current = window.setTimeout(() => {
        if (hasMoved) return; // drag supersedes hold
        if (isDoubleClick && todo.type === "numbered") {
          triggerCompletion(() => onFullComplete(todo.id));
        } else if (todo.type === "numbered") {
          onIncrement(todo.id);
          setIsHolding(false);
        } else {
          triggerCompletion(() => onComplete(todo.id));
        }
      }, HOLD_DURATION);
    };

    el.addEventListener("pointerdown", onDown);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      // Cleanup in case unmount during drag
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [todo.id, todo.type, onDragEnd, onComplete, onIncrement, onFullComplete]);

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
    setTimeout(() => {
      callback();
    }, 500);
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
    isHolding && "sticky-note--holding",
    isCompleting && "sticky-note--completing",
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={noteRef}
      className={className}
      style={cardStyle}
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
