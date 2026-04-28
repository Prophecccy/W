import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Transparent Tauri windows need body to be transparent from first paint
const transparentRoutes = ["/sticky-canvas", "/widget", "/alarm-popup"];
const isTransparent = transparentRoutes.some(route => window.location.href.includes(route));
if (isTransparent) {
  document.body.classList.add("transparent-window");
  document.documentElement.classList.add("transparent-window"); /* Explicitly clear html background */
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
