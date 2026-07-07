import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Todo } from "../../todos/types";
import { getToday } from "../../../shared/utils/dateUtils";
import { forceInteractive, sendStickyRegions } from "./StickyCanvas";
import { LucideIcon } from "../../../shared/components/IconPicker/LucideIcon";

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

async function safeInvoke(cmd: string, args?: any) {
  const { isTauri } = await import("../../../shared/utils/tauri");
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke(cmd, args);
    } catch (err) {
      console.error(`Failed to invoke command ${cmd}:`, err);
    }
  }
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
  const [completionState, setCompletionState] = useState<CompletionState>('idle');
  const [isExiting, setIsExiting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const noteRef = useRef<HTMLDivElement>(null);
  const livePosRef = useRef(position);
  const isDraggingRef = useRef(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const hasHeldRef = useRef(false);

  const completionStateRef = useRef<CompletionState>('idle');
  const undoTimerRef = useRef<number | null>(null);
  const fillTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

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

      // 15px threshold to cancel hold and visually start drag
      if (!hasMoved && (Math.abs(dx) > 15 || Math.abs(dy) > 15)) {
        hasMoved = true;
        isDraggingRef.current = true;
        // Direct DOM class manipulation — no React re-render
        el.classList.add("sticky-note--dragging");
        // Cancel hold
        cancelHold();
      }

      if (hasMoved) {
        // Clamp to viewport
        const width = el.offsetWidth || 220;
        const height = el.offsetHeight || 120;
        const maxDx = window.innerWidth - width - dragStart.ox;
        const minDx = -dragStart.ox;
        const maxDy = window.innerHeight - height - dragStart.oy;
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

      const t = todoRef.current;
      const clicked = !hasMoved && !hasHeldRef.current;

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
        onDragEndRef.current(t.id, finalPos);

        // Defer Rust hit-test regions update
        setTimeout(async () => {
          let offsetX = 0;
          let offsetY = 0;
          try {
            const { isTauri } = await import("../../../shared/utils/tauri");
            if (isTauri()) {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              const winPos = await getCurrentWindow().outerPosition();
              offsetX = winPos.x;
              offsetY = winPos.y;
            }
          } catch (err) {
            console.error("Failed to get window position for hit test:", err);
          }

          const notes = document.querySelectorAll(".sticky-note");
          const regions: Array<{ left: number; top: number; right: number; bottom: number }> = [];
          notes.forEach((n) => {
            const r = n.getBoundingClientRect();
            const dpr = window.devicePixelRatio;
            regions.push({
              left: Math.round(r.left * dpr) + offsetX,
              top: Math.round(r.top * dpr) + offsetY,
              right: Math.round(r.right * dpr) + offsetX,
              bottom: Math.round(r.bottom * dpr) + offsetY,
            });
          });
          sendStickyRegions(regions);
        }, 50);
      } else if (clicked) {
        // Handle click (without drag or hold)
        if (t.type === "numbered") {
          onIncrementRef.current(t.id);
        } else {
          setExpanded(prev => !prev);
        }
      }

      // ALWAYS release drag mode on pointer up
      safeInvoke("set_sticky_drag_mode", { dragging: false }).catch(() => {});

      cancelHold();
      dragStart = null;
      hasMoved = false;
      latestDx = 0;
      latestDy = 0;
    };

    const onDown = (e: PointerEvent) => {
      // Disable interaction if in purgatory or completing
      if (completionStateRef.current !== 'idle') return;

      // Only handle primary (left) button
      if (e.button !== 0) return;

      // IMMEDIATELY tell Rust to keep the overlay interactive for the
      // entire duration of this pointer interaction.
      forceInteractive();
      safeInvoke("set_sticky_drag_mode", { dragging: true }).catch(() => {});

      dragStart = {
        x: e.clientX,
        y: e.clientY,
        ox: livePosRef.current.x,
        oy: livePosRef.current.y,
      };
      hasMoved = false;

      // Use WINDOW-level listeners
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);

      // Start hold-to-complete detection for standard and numbered todos
      const t = todoRef.current;
      hasHeldRef.current = false;
      setIsHolding(true);

      holdTimeoutRef.current = window.setTimeout(() => {
        if (hasMoved) return; // drag/move cancels hold
        hasHeldRef.current = true;
        setIsHolding(false);

        if (t.type === "numbered") {
          triggerCompletion(() => onFullCompleteRef.current(t.id));
        } else {
          triggerCompletion(() => onCompleteRef.current(t.id));
        }
      }, HOLD_DURATION);
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

    const t = todoRef.current;
    import("../../todos/services/todoService").then(({ addPendingCompletion }) => {
      addPendingCompletion(t.id, t.type === 'numbered' ? t.numbered : undefined);
    });

    if (fillTimerRef.current) clearTimeout(fillTimerRef.current);
    fillTimerRef.current = window.setTimeout(() => {
      if (completionStateRef.current !== 'completing') return;
      
      setCompState('undoable');
      
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = window.setTimeout(() => {
        if (completionStateRef.current === 'undoable') {
          setIsExiting(true);
          
          if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
          exitTimerRef.current = window.setTimeout(() => {
            import("../../todos/services/todoService").then(({ removePendingCompletion }) => {
              removePendingCompletion(t.id);
            });
            callback();
          }, 300); // wait for exit animation
        }
      }, 3500); // 3.5s undo window
    }, 300); // 300ms fill phase
  };

  const handleUndo = () => {
    if (fillTimerRef.current) {
      clearTimeout(fillTimerRef.current);
      fillTimerRef.current = null;
    }
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setCompState('idle');

    // Revert pending completion
    const t = todoRef.current;
    import("../../todos/services/todoService").then(({ removePendingCompletion }) => {
      removePendingCompletion(t.id);
    });
  };

  useEffect(() => {
    return () => {
      cancelHold();
      if (fillTimerRef.current) clearTimeout(fillTimerRef.current);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  // ─── Render Data ────────────────────────────────────────────────
  const today = getToday();
  let deadlineText: string | null = null;
  let isOverdue = false;

  if (todo.deadline) {
    const [y, m, d] = todo.deadline.split("-");
    const formattedDeadline = `${d}-${m}-${y}`;

    if (todo.deadline < today) {
      deadlineText = `DUE: ${formattedDeadline}`;
      isOverdue = true;
    } else if (todo.deadline === today) {
      deadlineText = "DUE: TODAY";
    } else {
      deadlineText = `DUE: ${formattedDeadline}`;
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
  const initiatedStr = `${initiatedDateObj.getDate().toString().padStart(2, '0')}-${(initiatedDateObj.getMonth() + 1).toString().padStart(2, '0')}-${initiatedDateObj.getFullYear()}`;

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
          <div className="sticky-note__title" style={{ flex: 1 }}>{todo.title}</div>
          {todo.description && (
            <div style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", marginLeft: "6px" }}>
              <LucideIcon name={expanded ? "ChevronUp" : "ChevronDown"} size={12} />
            </div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {expanded && todo.description && (
            <motion.div
              className="sticky-note__description"
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: 8 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              {todo.description}
            </motion.div>
          )}
        </AnimatePresence>

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
            {deadlineText ? deadlineText : "NO DEADLINE"}
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
