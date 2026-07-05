import { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import './Toast.css';

interface Toast {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, options?: { actionLabel?: string; onAction?: () => void; duration?: number }) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [activeToast, setActiveToast] = useState<Toast | null>(null);
  const [queue, setQueue] = useState<Toast[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideToast = useCallback((id: string) => {
    setActiveToast((current) => {
      if (current && current.id === id) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        return null;
      }
      return current;
    });
    setQueue((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, options?: { actionLabel?: string; onAction?: () => void; duration?: number }) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { id, message, ...options };
    setQueue((prev) => [...prev, newToast]);
  }, []);

  // Process queue whenever activeToast is null and queue has items
  useEffect(() => {
    if (!activeToast && queue.length > 0) {
      const next = queue[0];
      const remaining = queue.slice(1);
      setActiveToast(next);
      setQueue(remaining);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setActiveToast(null);
      }, next.duration ?? 8000);
    }
  }, [activeToast, queue]);

  // Clean up timeout on provider unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <div className="toast-container">
        {activeToast && (
          <div key={activeToast.id} className="toast">
            <span className="toast__message t-body">{activeToast.message}</span>
            {activeToast.actionLabel && activeToast.onAction && (
              <button 
                className="toast__action t-label"
                onClick={() => {
                  activeToast.onAction!();
                  hideToast(activeToast.id);
                }}
              >
                [ {activeToast.actionLabel} ]
              </button>
            )}
            <button className="toast__close" onClick={() => hideToast(activeToast.id)}>
              ×
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
