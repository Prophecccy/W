/**
 * Checks if we are inside a Tauri runtime (native desktop).
 * In a browser (npm run dev without Tauri), IPC calls will fail.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
}

/**
 * Checks if we are in a mobile browser (not Tauri, small viewport + touch).
 */
export function isMobileWeb(): boolean {
  if (isTauri()) return false;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isNarrow = window.innerWidth <= 768;
  return hasTouch && isNarrow;
}

export function openExternalLink(url: string) {
  if (isTauri()) {
    import("@tauri-apps/plugin-opener").then((opener) => {
      if (opener && (opener as any).open) {
        (opener as any).open(url);
      } else {
        window.open(url, "_blank", "noreferrer");
      }
    });
  } else {
    window.open(url, "_blank", "noreferrer");
  }
}
