import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Transparent Tauri windows need body to be transparent from first paint
const transparentRoutes = ["/sticky-canvas", "/widget", "/alarm-popup"];
if (transparentRoutes.includes(window.location.pathname)) {
  document.body.classList.add("transparent-window");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
