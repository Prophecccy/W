import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Global keyboard shortcuts.
 * - Ctrl+K → opens command palette
 * - H → Dashboard (when not typing)
 * - T → Todos (when not typing)
 * - A → Analytics (when not typing)
 * - S → Settings (when not typing)
 * - N → Context-dependent new item (when not typing)
 * - Space → Quick-complete focused habit (when not typing)
 */
export function useKeyboardShortcuts(
  onCommandPaletteToggle: () => void,
  onNewItem?: () => void,
  onQuickComplete?: () => void
) {
  const navigate = useNavigate();

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (el as HTMLElement).isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      // Ctrl+K → Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        onCommandPaletteToggle();
        return;
      }

      // Skip single-key shortcuts if user is typing
      if (isTyping()) return;

      switch (e.key.toLowerCase()) {
        case "h":
          navigate("/");
          break;
        case "t":
          navigate("/todos");
          break;
        case "a":
          navigate("/analytics");
          break;
        case "s":
          navigate("/settings");
          break;
        case "n":
          e.preventDefault();
          onNewItem?.();
          break;
        case " ": // Space key
          e.preventDefault();
          onQuickComplete?.();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, onCommandPaletteToggle, onNewItem, onQuickComplete]);
}
