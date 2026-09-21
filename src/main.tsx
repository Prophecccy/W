import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Transparent Tauri windows need body to be transparent from first paint
const transparentRoutes = ["/sticky-canvas", "/widget"];
const isTransparent = transparentRoutes.some(route => window.location.href.includes(route));
if (isTransparent) {
  document.body.classList.add("transparent-window");
  document.documentElement.classList.add("transparent-window"); /* Explicitly clear html background */
}

// Early OAuth Popup Interceptor:
// If this window is a Google OAuth popup returning with an access token,
// immediately communicate credentials back to the opener window and close without mounting React Router.
function handleEarlyOAuthCallback(): boolean {
  if (typeof window === "undefined") return false;

  const hash = window.location.hash || "";
  const search = window.location.search || "";
  const hasCode = search.includes("code=") || hash.includes("code=");
  const hasToken = hash.includes("access_token=") || search.includes("access_token=");
  const hasError = hash.includes("error=") || search.includes("error=");

  if (!hasCode && !hasToken && !hasError) return false;

  const isPopup = Boolean(window.opener || window.name === "google-login");
  if (!isPopup) return false;

  try {
    const rawParams = hash.startsWith("#") ? hash.substring(1) : (hash || search);
    const params = new URLSearchParams(rawParams);
    const searchParams = new URLSearchParams(search);

    const code = params.get("code") || searchParams.get("code");
    const accessToken = params.get("access_token") || searchParams.get("access_token");
    const error = params.get("error") || searchParams.get("error");
    const errorDesc = params.get("error_description") || searchParams.get("error_description");
    const expiresIn = params.get("expires_in") || searchParams.get("expires_in");
    const state = params.get("state") || searchParams.get("state");

    const payload = {
      type: "w:google-oauth-callback",
      code: code || null,
      accessToken: accessToken || null,
      expiresIn: expiresIn ? parseInt(expiresIn, 10) : 3600,
      error: error || null,
      errorDescription: errorDesc || null,
      state: state || null,
      timestamp: Date.now(),
    };

    // Channel 1: postMessage to opener
    if (window.opener) {
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch {
        /* ignore postMessage errors */
      }
    }

    // Channel 2: localStorage for storage event across windows
    try {
      localStorage.setItem("w_oauth_response", JSON.stringify(payload));
    } catch {
      /* ignore storage errors */
    }

    // Render minimal Endfield aesthetic closing view
    document.body.innerHTML = `
      <div style="background-color:#08090a;color:#e8e8e8;font-family:ui-monospace,Menlo,Consolas,monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">
        <div style="font-size:32px;font-weight:600;margin-bottom:16px;letter-spacing:-1px;">[ W ]</div>
        <div style="font-size:11px;color:#888;letter-spacing:2px;text-transform:uppercase;">Authentication complete. Transferring credentials...</div>
      </div>
    `;

    setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore close errors */
      }
    }, 150);

    return true;
  } catch (err) {
    console.error("[W Auth] Failed to handle early OAuth popup callback:", err);
    return false;
  }
}

if (!handleEarlyOAuthCallback()) {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Prevent default browser context menu globally for a native app feel
if (typeof window !== "undefined") {
  window.addEventListener("contextmenu", (e) => e.preventDefault());
}

