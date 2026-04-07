/**
 * Checks if we are inside a Tauri runtime (native desktop).
 * In a browser (npm run dev without Tauri), IPC calls will fail.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
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
