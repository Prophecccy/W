import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthContext } from "../context";

const TRANSPARENT_ROUTES = ["/sticky-canvas", "/widget", "/alarm-popup"];

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading, signingIn } = useAuthContext();
  const location = useLocation();
  const isTransparentWindow = TRANSPARENT_ROUTES.includes(location.pathname);

  const isPendingOAuth = location.pathname === "/oauth-complete" || signingIn;

  if (loading || (!user && isPendingOAuth)) {
    // For transparent windows, show nothing (invisible) while auth loads
    if (isTransparentWindow) {
      return <div style={{ background: "transparent" }} />;
    }
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="t-meta">{isPendingOAuth ? "AUTHENTICATING CREDENTIALS..." : "LOADING APP..."}</span>
      </div>
    );
  }

  if (!user) {
    // Transparent windows can't show login — just render empty
    if (isTransparentWindow) {
      return <div style={{ background: "transparent" }} />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

