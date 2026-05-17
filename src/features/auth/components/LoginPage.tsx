import { useAuthContext } from "../context";
import { Navigate } from "react-router-dom";
import { getCurrentWindow } from '@tauri-apps/api/window';
import "./LoginPage.css";

export function LoginPage() {
  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  const appWindow = isTauri ? getCurrentWindow() : null;
  const { user, loading, error, signingIn, signIn, clearError, devSkip } = useAuthContext();

  if (loading) {
    return (
      <div className="login-page">
        <div className="t-meta">LOADING...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleDrag = (e: React.PointerEvent) => {
    // Allow drag from anywhere EXCEPT interactive elements
    if (e.target instanceof Element && (
      e.target.closest('button') ||
      e.target.closest('a') ||
      e.target.closest('input')
    )) return;
    getCurrentWindow().startDragging();
  };

  return (
    <div className="login-page" onPointerDown={handleDrag}>
      <div className="login-page__controls">
        <button 
          className="login-page__close-btn t-label" 
          onClick={() => appWindow?.close()}
        >
          [ X ]
        </button>
      </div>

      <div className="login-page__content">
        <h1 className="login-page__logo t-display">[ W ]</h1>

        {error && (
          <div className="login-page__error" onClick={clearError}>
            <span className="t-meta" style={{ color: 'var(--strike-red)' }}>
              ⚠ {error}
            </span>
            <span className="t-meta" style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '8px' }}>
              CLICK TO DISMISS
            </span>
          </div>
        )}

        <button
          className="login-page__btn t-label"
          onClick={signIn}
          disabled={signingIn}
          style={signingIn ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
        >
          {signingIn ? "[ SIGNING IN... ]" : "[ SIGN IN WITH GOOGLE ]"}
        </button>

        {window.location.hostname === "localhost" && (
          <button 
            className="login-page__btn t-label" 
            onClick={devSkip}
            style={{ marginTop: '20px', opacity: 0.5, fontSize: '10px' }}
          >
            [ DEV-SKIP LOGIN ]
          </button>
        )}
      </div>
    </div>
  );
}

