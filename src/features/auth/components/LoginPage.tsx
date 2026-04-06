import { useAuthContext } from "../context";
import { Navigate } from "react-router-dom";
import "./LoginPage.css";

export function LoginPage() {
  const { user, loading, signIn, devSkip } = useAuthContext();

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

  return (
    <div className="login-page">
      <div className="login-page__content">
        <h1 className="login-page__logo t-display">[ W ]</h1>
        <button className="login-page__btn t-label" onClick={signIn}>
          [ SIGN IN WITH GOOGLE ]
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
