import { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SPRING_TACTILE } from '../../constants/motion';
import { playMechanicalClick, playSubtleThud } from '../../services/tactileAudioService';
import './Toast.css';

interface Toast {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
  createdAt: number;
}

interface ToastContextType {
  showToast: (message: string, options?: { actionLabel?: string; onAction?: () => void; duration?: number }) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const MAX_STACK = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const hideToast = useCallback((id: string) => {
    playSubtleThud();
    const t = timeoutsRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback((message: string, options?: { actionLabel?: string; onAction?: () => void; duration?: number }) => {
    playMechanicalClick();
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = {
      id,
      message,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction,
      duration: options?.duration ?? 5000,
      createdAt: Date.now(),
    };

    setToasts((prev) => [newToast, ...prev].slice(0, MAX_STACK));
  }, []);

  // Manage individual toast timers when not hovered
  useEffect(() => {
    if (isHovered) {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current.clear();
      return;
    }

    toasts.forEach((toast) => {
      if (!timeoutsRef.current.has(toast.id)) {
        const timeout = setTimeout(() => {
          hideToast(toast.id);
        }, toast.duration ?? 5000);
        timeoutsRef.current.set(toast.id, timeout);
      }
    });

    return () => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current.clear();
    };
  }, [toasts, isHovered, hideToast]);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <div 
        className={`toast-container ${isHovered ? 'toast-container--expanded' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast, index) => {
            const yOffset = isHovered ? -index * 56 : -index * 12;
            const scale = isHovered ? 1 : 1 - index * 0.05;
            const opacity = isHovered ? 1 : Math.max(0.65, 1 - index * 0.18);
            const zIndex = MAX_STACK - index;

            return (
              <motion.div
                key={toast.id}
                layout
                className="toast"
                style={{ zIndex }}
                initial={{ opacity: 0, y: 32, scale: 0.9 }}
                animate={{ 
                  opacity, 
                  y: yOffset, 
                  scale,
                  transition: SPRING_TACTILE 
                }}
                exit={{ 
                  opacity: 0, 
                  y: 16, 
                  scale: 0.9, 
                  transition: { duration: 0.15 } 
                }}
              >
                <span className="toast__message t-body">{toast.message}</span>
                {toast.actionLabel && toast.onAction && (
                  <button
                    className="toast__action t-label"
                    onClick={() => {
                      playMechanicalClick();
                      toast.onAction!();
                      hideToast(toast.id);
                    }}
                  >
                    [ {toast.actionLabel} ]
                  </button>
                )}
                <button
                  className="toast__close"
                  onClick={() => hideToast(toast.id)}
                  aria-label="Dismiss notification"
                >
                  ×
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
