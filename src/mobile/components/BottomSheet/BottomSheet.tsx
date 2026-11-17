import { useEffect, ReactNode } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { SPRING_MODAL } from "../../../shared/constants/motion";
import { playSubtleThud, playMechanicalClick } from "../../../shared/services/tactileAudioService";
import "./BottomSheet.css";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxHeight?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = "85vh",
}: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      playSubtleThud();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          playMechanicalClick();
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    // Dismiss if dragged down more than 90px or with strong downward velocity
    if (info.offset.y > 90 || info.velocity.y > 400) {
      playMechanicalClick();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="bottom-sheet-portal" role="dialog" aria-modal="true">
          <motion.div
            className="bottom-sheet__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={() => {
              playMechanicalClick();
              onClose();
            }}
          />
          <motion.div
            className="bottom-sheet__card"
            style={{ maxHeight }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING_MODAL}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
          >
            <div className="bottom-sheet__handle-bar">
              <div className="bottom-sheet__handle" />
            </div>

            <div className="bottom-sheet__header">
              <span className="bottom-sheet__title t-label">{title}</span>
              <button
                type="button"
                className="bottom-sheet__close-btn"
                onClick={() => {
                  playMechanicalClick();
                  onClose();
                }}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bottom-sheet__content">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
