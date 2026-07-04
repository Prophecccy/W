import { useState, useEffect } from "react";
import { useAuthContext } from "../context";
import { Navigate } from "react-router-dom";
import "./LoginPage.css";

export function LoginPage() {
  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  const [appWindow, setAppWindow] = useState<any>(null);
  const { user, loading, error, signingIn, signIn, clearError, devSkip } = useAuthContext();

  useEffect(() => {
    if (isTauri) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        setAppWindow(getCurrentWindow());
      }).catch(console.error);
    }
  }, [isTauri]);

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
    
    if (isTauri) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().startDragging();
      }).catch(console.error);
    }
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

      <div className="login-page__card">
        <h1 className="login-page__logo t-display">[ W ]</h1>
        <p className="login-page__subtitle t-meta">SOVEREIGN WORKSPACE ENGINE</p>

        <div className="login-page__divider" />

        <div className="login-page__manifesto">
          <h2 className="login-page__section-title t-label">[ SYSTEM REQUIREMENT: GOOGLE DRIVE ]</h2>
          <p className="login-page__desc t-body">
            To ensure complete self-sovereignty, this application caches all data locally and uses your personal **Google Drive** for backup and cloud synchronization.
          </p>
          
          <div className="login-page__features">
            <div className="login-page__feature-card">
              <span className="login-page__feature-icon">🛡</span>
              <div className="login-page__feature-text">
                <span className="t-label" style={{ fontSize: "10px", color: "var(--accent)" }}>100% CLIENT-SIDE & SECURE</span>
                <span className="t-body" style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                  Your data resides safely in your personal Drive container. No external servers or third-party tracking databases are used.
                </span>
              </div>
            </div>

            <div className="login-page__feature-card">
              <span className="login-page__feature-icon">🔄</span>
              <div className="login-page__feature-text">
                <span className="t-label" style={{ fontSize: "10px", color: "var(--accent)" }}>CROSS-PLATFORM SYNC</span>
                <span className="t-body" style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                  Your focus metrics, habits, and lockdown states automatically sync across all your authenticated desktop devices.
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="login-page__divider" />

        <div className="login-page__actions">
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
            className="login-page__btn login-page__btn--primary t-label"
            onClick={signIn}
            disabled={signingIn}
            style={signingIn ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            {signingIn ? "[ CONNECTING PROTOCOL... ]" : "[ LINK GOOGLE DRIVE ]"}
          </button>

          {window.location.hostname === "localhost" && (
            <button 
              className="login-page__btn login-page__btn--dev t-label" 
              onClick={devSkip}
              style={{ marginTop: '12px', opacity: 0.5, fontSize: '9px' }}
            >
              [ DEV-SKIP LOGIN ]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

