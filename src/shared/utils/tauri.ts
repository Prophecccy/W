import { sanitizeUrl } from './security';

/**
 * Checks if we are inside a Tauri runtime (native desktop).
 * In a browser (npm run dev without Tauri), IPC calls will fail.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
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

