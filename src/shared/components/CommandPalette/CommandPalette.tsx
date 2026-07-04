import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ListChecks,

  BarChart3,
  Settings,
  Search,
  Plus,
  Target,
  CheckCircle2,
  User,
  Palette,
  Monitor,
  Clock,
  Bell,
  HardDrive,
  type LucideIcon as LucideIconType,
} from "lucide-react";
import { LucideIcon } from "../IconPicker/LucideIcon";
import type { Habit } from "../../../features/habits/types";
import type { Todo } from "../../../features/todos/types";
import "./CommandPalette.css";

// ─── Types ──────────────────────────────────────────────────────
type CommandCategory = "pages" | "actions" | "habits" | "todos";

interface CommandItem {
  id: string;
  label: string;
  icon: React.ElementType | string; // ElementType for Lucide components, string for dynamic names
  iconIsDynamic?: boolean;
  category: CommandCategory;
  action: () => void;
  keywords: string[];
  accent?: string; // optional color for habit/todo items
}

interface CommandPaletteProps {
  onClose: () => void;
  habits?: Habit[];
  todos?: Todo[];
  onCompleteHabit?: (habitId: string) => void;
  onOpenNewHabit?: () => void;
  onOpenNewTodo?: () => void;
}

// ─── Category Labels ────────────────────────────────────────────
const CATEGORY_LABELS: Record<CommandCategory, string> = {
  pages: "PAGES",
  actions: "ACTIONS",
  habits: "HABITS",
  todos: "TODOS",
};

const CATEGORY_ORDER: CommandCategory[] = ["pages", "actions", "habits", "todos"];

// ─── Component ──────────────────────────────────────────────────
export function CommandPalette({
  onClose,
  habits = [],
  todos = [],
  onCompleteHabit,
  onOpenNewHabit,
  onOpenNewTodo,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // ── Build item list ──────────────────────────────────────────
  const items: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [];

    // Pages
    list.push(
      {
        id: "page-dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        category: "pages",
        action: () => { navigate("/"); onClose(); },
        keywords: ["home", "dashboard", "main"],
      },
      {
        id: "page-habits",
        label: "Habits",
        icon: Target,
        category: "pages",
        action: () => { navigate("/habits"); onClose(); },
        keywords: ["habits", "routines"],
      },
      {
        id: "page-todos",
        label: "Todos",
        icon: ListChecks,
        category: "pages",
        action: () => { navigate("/todos"); onClose(); },
        keywords: ["tasks", "todos", "list", "todo"],
      },

      {
        id: "page-analytics",
        label: "Analytics",
        icon: BarChart3,
        category: "pages",
        action: () => { navigate("/analytics"); onClose(); },
        keywords: ["analytics", "stats", "charts", "insights", "data"],
      },
      {
        id: "page-settings",
        label: "Settings",
        icon: Settings,
        category: "pages",
        action: () => { navigate("/settings"); onClose(); },
        keywords: ["settings", "config", "preferences", "options"],
      },
      {
        id: "page-settings-account",
        label: "Settings: Account",
        icon: User,
        category: "pages",
        action: () => { navigate("/settings?tab=account"); onClose(); },
        keywords: ["settings", "account", "profile", "user"],
      },
      {
        id: "page-settings-appearance",
        label: "Settings: Appearance",
        icon: Palette,
        category: "pages",
        action: () => { navigate("/settings?tab=appearance"); onClose(); },
        keywords: ["settings", "appearance", "theme", "accent", "colors", "wallpapers", "wallpaper"],
      },
      {
        id: "page-settings-desktop",
        label: "Settings: Desktop",
        icon: Monitor,
        category: "pages",
        action: () => { navigate("/settings?tab=desktop"); onClose(); },
        keywords: ["settings", "desktop", "widget", "layout", "align"],
      },
      {
        id: "page-settings-sleep-tube",
        label: "Settings: Sleep Tube",
        icon: Clock,
        category: "pages",
        action: () => { navigate("/settings?tab=sleep-tube"); onClose(); },
        keywords: ["settings", "sleep", "tube", "bedtime", "wakeup"],
      },
      {
        id: "page-settings-schedule",
        label: "Settings: Schedule & Time",
        icon: Clock,
        category: "pages",
        action: () => { navigate("/settings?tab=schedule"); onClose(); },
        keywords: ["settings", "schedule", "time", "reset"],
      },
      {
        id: "page-settings-notifications",
        label: "Settings: Notifications",
        icon: Bell,
        category: "pages",
        action: () => { navigate("/settings?tab=notifications"); onClose(); },
        keywords: ["settings", "notifications", "alerts", "nudges"],
      },
      {
        id: "page-settings-data",
        label: "Settings: Data & System",
        icon: HardDrive,
        category: "pages",
        action: () => { navigate("/settings?tab=data"); onClose(); },
        keywords: ["settings", "data", "system", "freeze", "backup", "restore"],
      }
    );

    // Actions
    if (onOpenNewHabit) {
      list.push({
        id: "action-new-habit",
        label: "Create New Habit",
        icon: Plus,
        category: "actions",
        action: () => { onOpenNewHabit(); onClose(); },
        keywords: ["create", "new", "habit", "add"],
      });
    }

    if (onOpenNewTodo) {
      list.push({
        id: "action-new-todo",
        label: "Create New Todo",
        icon: Plus,
        category: "actions",
        action: () => { onOpenNewTodo(); onClose(); },
        keywords: ["create", "new", "todo", "task", "add"],
      });
    }

    // Habits (searchable)
    habits.forEach((h) => {
      // Navigate to dashboard and select
      list.push({
        id: `habit-${h.id}`,
        label: h.title,
        icon: h.icon,
        iconIsDynamic: true,
        category: "habits",
        accent: h.color,
        action: () => {
          if (location.pathname !== "/") navigate("/");
          // Emit a custom event the DashboardPage can listen to
          window.dispatchEvent(new CustomEvent("w:select-habit", { detail: h.id }));
          onClose();
        },
        keywords: [h.title.toLowerCase(), h.description?.toLowerCase() || "", h.type, h.period],
      });

      // Detailed View trigger item
      list.push({
        id: `detailed-habit-${h.id}`,
        label: `Detailed: ${h.title}`,
        icon: BarChart3,
        category: "actions",
        accent: h.color,
        action: () => {
          navigate(`/analytics?habit=${h.id}`);
          onClose();
        },
        keywords: ["detailed", h.title.toLowerCase()],
      });

      // Complete action (only if callback provided)
      if (onCompleteHabit) {
        list.push({
          id: `complete-habit-${h.id}`,
          label: `Complete ${h.title}`,
          icon: CheckCircle2,
          category: "actions",
          accent: h.color,
          action: () => { onCompleteHabit(h.id); onClose(); },
          keywords: ["complete", "finish", "done", h.title.toLowerCase()],
        });
      }
    });

    // Todos (searchable)
    todos.forEach((t) => {
      list.push({
        id: `todo-${t.id}`,
        label: t.title,
        icon: ListChecks,
        category: "todos",
        accent: t.color,
        action: () => {
          if (location.pathname !== "/todos") navigate("/todos");
          onClose();
        },
        keywords: [t.title.toLowerCase(), t.description?.toLowerCase() || "", t.type],
      });
    });

    return list;
  }, [navigate, onClose, habits, todos, onCompleteHabit, onOpenNewHabit, onOpenNewTodo, location.pathname]);

  // ── Filter ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) {
      // Show pages + actions only when no query
      return items.filter((i) => i.category === "pages" || i.category === "actions");
    }
    const q = query.toLowerCase().trim();

    // Special handling for "detailed <habitname>" syntax search
    if (q.startsWith("detailed")) {
      const rest = q.substring(8).trim();
      // Filter only to detailed-habit items
      return items.filter(
        (item) =>
          item.id.startsWith("detailed-habit-") &&
          (rest === "" || item.keywords.some((kw) => kw.includes(rest)))
      );
    }

    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.includes(q))
    );
  }, [query, items]);

  // ── Group by category ────────────────────────────────────────
  const grouped = useMemo(() => {
    const groups: { category: CommandCategory; items: CommandItem[] }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const catItems = filtered.filter((i) => i.category === cat);
      if (catItems.length > 0) {
        groups.push({ category: cat, items: catItems });
      }
    }
    return groups;
  }, [filtered]);

  // Flattened for keyboard navigation
  const flatFiltered = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // ── Focus ────────────────────────────────────────────────────
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // ── Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (flatFiltered.length > 0) {
          setSelectedIndex((i) => {
            const current = isNaN(i) ? 0 : i;
            return (current + 1) % flatFiltered.length;
          });
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (flatFiltered.length > 0) {
          setSelectedIndex((i) => {
            const current = isNaN(i) ? 0 : i;
            return (current - 1 + flatFiltered.length) % flatFiltered.length;
          });
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatFiltered.length > 0 && !isNaN(selectedIndex)) {
          flatFiltered[selectedIndex]?.action();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, flatFiltered, selectedIndex]);

  // ── Render ───────────────────────────────────────────────────
  let runningIndex = 0;

  return (
    <div className="command-palette__backdrop" onClick={onClose}>
      <div
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="command-palette__input-row">
          <Search size={14} strokeWidth={1.5} />
          <input
            ref={inputRef}
            className="command-palette__input t-body"
            type="text"
            placeholder="Search pages, habits, todos..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="command-palette__results">
          {flatFiltered.length === 0 ? (
            <div className="command-palette__empty t-meta">NO RESULTS</div>
          ) : (
            grouped.map((group) => {
              const section = (
                <div key={group.category} className="command-palette__section">
                  <div className="command-palette__section-label t-meta">
                    [ {CATEGORY_LABELS[group.category]} ]
                  </div>
                  {group.items.map((item) => {
                    const idx = runningIndex++;
                    return (
                      <button
                        key={item.id}
                        className={`command-palette__item t-body${
                          idx === selectedIndex ? " command-palette__item--selected" : ""
                        }`}
                        onClick={item.action}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        {item.iconIsDynamic ? (
                          <LucideIcon
                            name={item.icon as string}
                            size={14}
                            style={item.accent ? { color: item.accent } : undefined}
                          />
                        ) : (
                          (() => {
                            const Icon = item.icon as LucideIconType;
                            return <Icon size={14} strokeWidth={1.5} style={item.accent ? { color: item.accent } : undefined} />;
                          })()
                        )}
                        <span className="command-palette__item-text">{item.label}</span>
                        {idx === selectedIndex && (
                          <span className="command-palette__item-shortcut t-meta">[ ENTER ]</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
              return section;
            })
          )}
        </div>
      </div>
    </div>
  );
}
