import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initAudioOnUserGesture } from "./shared/services/tactileAudioService";

// Unlock Web Audio API on first user interaction
initAudioOnUserGesture();

// Transparent Tauri windows need body to be transparent from first paint
const transparentRoutes = ["/sticky-canvas", "/widget", "/tray-menu"];
const isTransparent = transparentRoutes.some((route) => window.location.href.includes(route));
if (isTransparent) {
  document.body.classList.add("transparent-window");
  document.documentElement.classList.add("transparent-window");
}

/**
 * Early BFF OAuth Popup Interceptor:
 * Intercepts `/oauth-complete?status=...` inside the OAuth popup before React Router mounts,
 * signals the opener via postMessage/storage without ever passing tokens in URLs or DOM,
 * and closes the popup cleanly using safe DOM APIs (no innerHTML).
 */
function handleEarlyOAuthCallback(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.pathname !== "/oauth-complete") return false;

  const isPopup = Boolean(window.opener || window.name === "google-login");
  if (!isPopup) return false;

  try {
    const searchParams = new URLSearchParams(window.location.search || "");
    const status = searchParams.get("status") || "error";

    const payload = {
      type: "w:bff-auth-complete",
      status,
      timestamp: Date.now(),
    };

    if (window.opener) {
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch {
        /* ignore cross-window errors */
      }
    }

    try {
      localStorage.setItem("w_oauth_response", JSON.stringify(payload));
    } catch {
      /* ignore storage errors */
    }

    // Safe DOM construction (zero innerHTML)
    const container = document.createElement("div");
    container.style.cssText =
      "background-color:#08090a;color:#e8e8e8;font-family:ui-monospace,Menlo,Consolas,monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;";

    const logo = document.createElement("div");
    logo.style.cssText = "font-size:32px;font-weight:600;margin-bottom:16px;letter-spacing:-1px;";
    logo.textContent = "[ W ]";

    const msg = document.createElement("div");
    msg.style.cssText = "font-size:11px;color:#888;letter-spacing:2px;text-transform:uppercase;";
    msg.textContent = status === "ok" ? "Authentication complete. Returning to workspace..." : "Authentication incomplete. Closing window...";

    container.appendChild(logo);
    container.appendChild(msg);
    document.body.replaceChildren(container);

    setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore close errors */
      }
    }, 150);

    return true;
  } catch (err) {
    console.error("[W Auth] Failed to handle BFF popup completion:", err);
    return false;
  }
}

if (!handleEarlyOAuthCallback()) {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Prevent default browser context menu globally for a native app feel
if (typeof window !== "undefined") {
  window.addEventListener("contextmenu", (e) => e.preventDefault());
}
