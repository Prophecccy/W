import { sanitizeUrl } from './security';

const SECONDARY_TAURI_ROUTES = [
  "/widget",
  "/sticky-canvas",
  "/tray-menu",
  "/block-overlay",
  "/todo-creator",
];

/**
 * Checks if we are inside a Tauri runtime (native desktop).
 * In a browser (npm run dev without Tauri), IPC calls will fail.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
}

/**
 * Returns true only when executing inside the primary Tauri "main" window.
 * Secondary windows (widget, sticky-overlay, tray-menu, block-overlay, todo-creator) return false.
 */
export function isPrimaryTauriWindow(): boolean {
  if (!isTauri()) return false;
  const label = (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
  if (typeof label === 'string' && label.length > 0) {
    return label === 'main';
  }
  const path = typeof window !== 'undefined' ? (window.location?.pathname || '/') : '/';
  return !SECONDARY_TAURI_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

/**
 * True for Web/Mobile browsers and the Tauri "main" window; false for background Tauri sub-windows
 * that must not touch the DPAPI vault or Google Drive background sync.
 */
export function isSyncCapableContext(): boolean {
  return !isTauri() || isPrimaryTauriWindow();
}

/**
 * Checks if we are in a mobile browser (not Tauri, mobile user agent or small touch viewport).
 */
export function isMobileWeb(): boolean {
  if (isTauri()) return false;
  if (typeof window === 'undefined') return false;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isNarrow = window.innerWidth <= 900;
  return isMobileUA || (hasTouch && isNarrow);
}

export function openExternalLink(url: string) {
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) {
    console.warn('[Security] Refused to open unsafe or malformed external link:', url);
    return;
  }

  if (isTauri()) {
    import("@tauri-apps/plugin-opener").then((opener) => {
      if (opener && (opener as any).open) {
        (opener as any).open(safeUrl);
      } else {
        window.open(safeUrl, "_blank", "noopener,noreferrer");
      }
    });
  } else {
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  }
}

export async function confirmDialog(message: string): Promise<boolean> {
  if (isTauri()) {
    try {
      const { ask } = await import("@tauri-apps/plugin-dialog");
      return await ask(message, { title: "W", kind: "warning" });
    } catch (e) {
      console.error("Tauri dialog.ask failed, falling back to window.confirm", e);
    }
  }
  return window.confirm(message);
}

