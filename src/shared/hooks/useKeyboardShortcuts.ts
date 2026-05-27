import { useEffect, useRef } from "react";
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
  onQuickComplete?: () => void,
  isLocked: boolean = false
) {
  const navigate = useNavigate();

  const toggleRef = useRef(onCommandPaletteToggle);
  const newItemRef = useRef(onNewItem);
  const quickCompleteRef = useRef(onQuickComplete);
  const isLockedRef = useRef(isLocked);

  // Keep refs hot on every render
  useEffect(() => {
    toggleRef.current = onCommandPaletteToggle;
    newItemRef.current = onNewItem;
    quickCompleteRef.current = onQuickComplete;
    isLockedRef.current = isLocked;
  });

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
      // Block all shortcuts if locked out
      if (isLockedRef.current) return;

      // Ctrl+K → Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        toggleRef.current();
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
          newItemRef.current?.();
          break;
        case " ": // Space key
          e.preventDefault();
          quickCompleteRef.current?.();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
}
