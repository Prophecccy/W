import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
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
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, options?: { actionLabel?: string; onAction?: () => void; duration?: number }) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, ...options }]);

    setTimeout(() => {
      hideToast(id);
    }, options?.duration ?? 8000);
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <span className="toast__message t-body">{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button 
                className="toast__action t-label"
                onClick={() => {
                  toast.onAction!();
                  hideToast(toast.id);
                }}
              >
                [ {toast.actionLabel} ]
              </button>
            )}
            <button className="toast__close" onClick={() => hideToast(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
