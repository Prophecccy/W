import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
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

type CompletionState = 'idle' | 'completing' | 'undoable';

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
  const [completionState, setCompletionState] = useState<CompletionState>('idle');
  const [isExiting, setIsExiting] = useState(false);

  const noteRef = useRef<HTMLDivElement>(null);
  const livePosRef = useRef(position);
  const isDraggingRef = useRef(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<number | null>(null);

  const completionStateRef = useRef<CompletionState>('idle');
  const undoTimerRef = useRef<number | null>(null);

  const setCompState = (state: CompletionState) => {
    completionStateRef.current = state;
    setCompletionState(state);
  };

  // ─── Stable callback refs ─────────────────────────────────────
  // The native drag useEffect must NEVER tear down mid-drag.
  // Storing callbacks in refs lets us depend only on [todo.id]
  // so Firestore-triggered re-renders don't kill active listeners.
  const todoRef = useRef(todo);
  todoRef.current = todo;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onIncrementRef = useRef(onIncrement);
  onIncrementRef.current = onIncrement;
  const onFullCompleteRef = useRef(onFullComplete);
  onFullCompleteRef.current = onFullComplete;

  const HOLD_DURATION = 500;

  // Sync external position changes — but NEVER during an active drag.
  // If Firestore fires onSnapshot mid-drag, we must ignore it so the
  // note doesn't teleport to the stale DB position.
  useEffect(() => {
    if (isDraggingRef.current) return;
    setPos(position);
    livePosRef.current = position;
  }, [position]);

  // ─── FULLY NATIVE drag system ─────────────────────────────────
  // Bypasses React synthetic events entirely for maximum performance.
  // Uses window-level listeners for move/up so the cursor is tracked
  // even when it leaves the note's bounding box mid-drag.
  //
  // CRITICAL: setPointerCapture DOES NOT WORK in WebView2 transparent
  // windows because the OS stops delivering WM_POINTER* messages when
  // WS_EX_TRANSPARENT is set. Instead, we tell Rust to keep the window
  // interactive (DRAG_MODE = true) the moment the user presses down,
  // BEFORE any movement threshold. This prevents the polling thread
  // from ever toggling transparency during an active interaction.
  useEffect(() => {
    const el = noteRef.current;
    if (!el) return;

    let dragStart: { x: number; y: number; ox: number; oy: number } | null = null;
    let hasMoved = false;
    let latestDx = 0;
    let latestDy = 0;
    let rafId: number | null = null;

    // Detach window listeners (safe to call even if not attached)
    const detachWindowListeners = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    const onMove = (e: PointerEvent) => {
      if (!dragStart) return;

      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      // 5px threshold to visually start drag
      if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        hasMoved = true;
        isDraggingRef.current = true;
        // Direct DOM class manipulation — no React re-render
        el.classList.add("sticky-note--dragging");
        // Cancel hold
        cancelHold();
      }

      if (hasMoved) {
        // Clamp to viewport
        const maxDx = window.innerWidth - 150 - dragStart.ox;
        const minDx = -dragStart.ox;
        const maxDy = window.innerHeight - 60 - dragStart.oy;
        const minDy = -dragStart.oy;
        latestDx = Math.max(minDx, Math.min(maxDx, dx));
        latestDy = Math.max(minDy, Math.min(maxDy, dy));

        // Apply immediately to trace the hardware cursor synchronously (zero VSync delay)
        el.style.transform = `translate(${latestDx}px, ${latestDy}px)`;

        // Update ref for final position
        livePosRef.current = {
          x: dragStart.ox + latestDx,
          y: dragStart.oy + latestDy,
        };
      }
    };

    const onUp = (_e: PointerEvent) => {
      // Remove window listeners immediately
      detachWindowListeners();

      // Cancel any pending RAF
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      if (hasMoved) {
        const finalPos = livePosRef.current;

        // CRITICAL ORDER: Apply these while .sticky-note--dragging
        // is still present (transition: none !important is active).
        el.classList.remove("sticky-note--holding");

        // Set final left/top
        el.style.left = `${finalPos.x}px`;
        el.style.top = `${finalPos.y}px`;
        el.style.transform = "";

        // Sync React state OPTIMISTICALLY
        setPos(finalPos);
        onDragEndRef.current(todoRef.current.id, finalPos);

        // Safely restore transitions AFTER layout commit
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (el) el.classList.remove("sticky-note--dragging");
            isDraggingRef.current = false;
          });
        });

        // Defer Rust hit-test regions update
        setTimeout(() => {
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
        }, 50);
      } else {
        isDraggingRef.current = false;
      }

      // ALWAYS release drag mode on pointer up — for both drag and non-drag
      invoke("set_sticky_drag_mode", { dragging: false }).catch(() => {});

      cancelHold();
      dragStart = null;
      hasMoved = false;
      latestDx = 0;
      latestDy = 0;
    };

    const onDown = (e: PointerEvent) => {
      console.log("[StickyNote] pointerdown fired!", { button: e.button, completionState: completionStateRef.current, x: e.clientX, y: e.clientY });

      // ── Z-Order Enforcer: Active Defense on Click ──
      try {
        invoke("pin_widget_bottom").catch(() => {});
        import("@tauri-apps/api/webviewWindow").then(({ WebviewWindow }) => {
          WebviewWindow.getByLabel("main").then(main => {
            if (main) {
              main.isMinimized().then(isMin => {
                if (!isMin) main.setFocus();
              });
            }
          }).catch(() => {});
        }).catch(() => {});
      } catch {}

      // Disable interaction if in purgatory or completing
      if (completionStateRef.current !== 'idle') return;

      // Only handle primary (left) button
      if (e.button !== 0) return;

      // IMMEDIATELY tell Rust to keep the overlay interactive for the
      // entire duration of this pointer interaction. This MUST happen
      // before any movement so the polling thread never toggles
      // WS_EX_TRANSPARENT while we're tracking the pointer.
      forceInteractive();
      invoke("set_sticky_drag_mode", { dragging: true }).catch(() => {});

      dragStart = {
        x: e.clientX,
        y: e.clientY,
        ox: livePosRef.current.x,
        oy: livePosRef.current.y,
      };
      hasMoved = false;

      // Use WINDOW-level listeners — pointer capture doesn't work in
      // WebView2 transparent windows (WS_EX_TRANSPARENT blocks WM_POINTER*)
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);

      // ─── Double click detection ────────────────────
      clickCountRef.current += 1;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = window.setTimeout(() => {
        clickCountRef.current = 0;
      }, 400);

      const isDoubleClick = clickCountRef.current >= 2;
      const t = todoRef.current;

      // Double click marks the task as complete
      if (isDoubleClick) {
        // Clean up the listeners we just attached — completion takes over
        detachWindowListeners();
        dragStart = null;
        invoke("set_sticky_drag_mode", { dragging: false }).catch(() => {});

        if (t.type === "numbered") {
          triggerCompletion(() => onFullCompleteRef.current(t.id));
        } else {
          triggerCompletion(() => onCompleteRef.current(t.id));
        }
        cancelHold();
        return;
      }

      // ─── Hold detection (Only for Numbered Increment) ────────────────────
      if (t.type === "numbered") {
        setIsHolding(true);
        holdTimeoutRef.current = window.setTimeout(() => {
          if (hasMoved) return; // drag supersedes hold
          onIncrementRef.current(t.id);
          setIsHolding(false);
        }, HOLD_DURATION);
      }
    };

    console.log("[StickyNote] Attaching pointerdown listener to:", el, "todo:", todo.id);
    el.addEventListener("pointerdown", onDown);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      detachWindowListeners();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id]); // ONLY re-attach listeners when the note identity changes

  const cancelHold = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    setIsHolding(false);
  };

  const triggerCompletion = (callback: () => void) => {
    cancelHold();
    setCompState('completing');

    setTimeout(() => {
      if (completionStateRef.current !== 'completing') return;
      
      setCompState('undoable');
      
      undoTimerRef.current = window.setTimeout(() => {
        if (completionStateRef.current === 'undoable') {
          setIsExiting(true);
          setTimeout(() => {
            callback();
          }, 300); // wait for exit animation
        }
      }, 3500); // 3.5s undo window
    }, 300); // 300ms fill phase
  };

  const handleUndo = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setCompState('idle');
  };

  useEffect(() => {
    return () => {
      cancelHold();
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
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

  const baseClassName = [
    "sticky-note",
    isHolding && "sticky-note--holding",
    isExiting && "sticky-note--exiting",
  ].filter(Boolean).join(" ");

  // Ensure we don't wipe the native dragging class during a render
  const isNativeDragging = noteRef.current?.classList.contains("sticky-note--dragging");
  const finalClassName = isNativeDragging ? `${baseClassName} sticky-note--dragging` : baseClassName;

  const initiatedDateObj = new Date(todo.createdAt);
  const initiatedStr = `${initiatedDateObj.getFullYear().toString().slice(2)}.${(initiatedDateObj.getMonth() + 1).toString().padStart(2, '0')}.${initiatedDateObj.getDate().toString().padStart(2, '0')}`;

  return (
    <div
      ref={noteRef}
      className={finalClassName}
      style={cardStyle}
      onContextMenu={(e) => e.preventDefault()}
      draggable={false}
    >
      {/* Hold / Complete / Undo fill overlay */}
      {(completionState === 'completing' || completionState === 'undoable') && (
        <motion.div
          className={`sticky-note__fill ${
            completionState === 'completing' ? 'sticky-note__fill--completing' :
            completionState === 'undoable' ? 'sticky-note__fill--undoable' : ''
          }`}
          initial={{ width: "0%" }}
          animate={{
            width: completionState === 'completing' ? "100%" : "0%"
          }}
          transition={{ 
            duration: completionState === 'completing' ? 0.3 
                    : completionState === 'undoable' ? 3.5 
                    : 0,
            ease: completionState === 'completing' ? "easeOut" 
                : completionState === 'undoable' ? "linear" 
                : "linear"
          }}
        />
      )}

      <div className={`sticky-note__content ${completionState === 'undoable' ? 'sticky-note__content--hidden' : ''}`}>
        <div className="sticky-note__header">
          <div className="sticky-note__checkbox" />
          <div className="sticky-note__title">{todo.title}</div>
        </div>

        {todo.description && (
          <div className="sticky-note__description">{todo.description}</div>
        )}

        {todo.type === "numbered" && todo.numbered && (
           <div className="sticky-note__progress-footer">
              <div className="sticky-note__badge sticky-note__badge--numbered">
                {todo.numbered.current}/{todo.numbered.target}
              </div>
              <div className="sticky-note__progress">
                <div
                  className="sticky-note__progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
           </div>
        )}

        <div className="sticky-note__divider" />

        <div className="sticky-note__footer">
          <div className="sticky-note__footer-half">
            INIT: {initiatedStr}
          </div>
          <div className="sticky-note__footer-divider" />
          <div className={`sticky-note__footer-half ${isOverdue ? 'sticky-note__footer-half--overdue' : ''}`}>
            {deadlineText ? `T-MINUS: ${deadlineText}` : "NO DEADLINE"}
          </div>
        </div>
      </div>

      {completionState === 'undoable' && (
        <div 
          className="sticky-note__undo-overlay"
          onPointerDown={(e) => {
            e.stopPropagation();
            handleUndo();
          }}
        >
          [ UNDO ]
        </div>
      )}
    </div>
  );
}
