import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { SPRING_MODAL, SPRING_LAYOUT } from "../../constants/motion";
import { playMechanicalClick, playSubtleThud } from "../../services/tactileAudioService";
import {
  LayoutDashboard,
  ListChecks,

  BarChart3,
  Settings,
  Search,
  Plus,
  Target,
  User,
  Palette,
  Monitor,
  Clock,
  Bell,
  HardDrive,
  HelpCircle,
  Trash2,
  type LucideIcon as LucideIconType,
} from "lucide-react";
import { LucideIcon } from "../IconPicker/LucideIcon";
import type { Habit } from "../../../features/habits/types";
import type { Todo, TodoPriority } from "../../../features/todos/types";
import { PRIORITY_CONFIG } from "../../../features/todos/types";
import { parseNaturalCommand, ParsedCommand } from "../../utils/naturalLanguageParser";
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
  dailyResetTime?: string;
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
  onOpenNewHabit,
  onOpenNewTodo,
  dailyResetTime,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [executing, setExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // ── Direct Natural Language Action Execution ─────────────────
  const handleExecuteDirectAction = useCallback(async (action: ParsedCommand) => {
    if (executing) return;
    setExecuting(true);

    try {
      if (action.type.startsWith("DELETE")) {
        playSubtleThud();
      } else {
        playMechanicalClick();
      }
      switch (action.type) {
        case "CREATE_TODO": {
          const { createTodo } = await import("../../../features/todos/services/todoService");
          const priorityKey: TodoPriority = action.priority || "p3";
          const priorityColor = PRIORITY_CONFIG[priorityKey]?.color || "#5B8DEF";
          await createTodo({
            title: action.title,
            description: "",
            type: "standard",
            priority: priorityKey,
            color: priorityColor,
            deadline: action.dueDate || null,
            future: null,
            group: null,
            order: todos.length,
          });
          window.dispatchEvent(
            new CustomEvent("w:toast", {
              detail: `[ TODO CREATED ] - ${action.title}${action.dueDateLabel ? ` (${action.dueDateLabel})` : ""}`,
            })
          );
          onClose();
          break;
        }

        case "DELETE_TODO": {
          if (!action.targetTodo) return;
          const { deleteTodo } = await import("../../../features/todos/services/todoService");
          await deleteTodo(action.targetTodo.id);
          window.dispatchEvent(
            new CustomEvent("w:toast", {
              detail: `[ TODO DELETED ] - ${action.targetTodo.title}`,
            })
          );
          onClose();
          break;
        }

        case "CREATE_HABIT": {
          const { createHabit } = await import("../../../features/habits/services/habitService");
          const { getToday } = await import("../../utils/dateUtils");
          await createHabit({
            title: action.title,
            description: "",
            period: action.period || "daily",
            type: "standard",
            frequency: 1,
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            intervalDays: 2,
            lastCompletedDate: null,
            startDate: getToday(undefined, dailyResetTime),
            metric: null,
            duration: { type: "continuing" },
            level: 0,
            totalCompletions: 0,
            levelProgress: 0,
            currentStreak: 0,
            longestStreak: 0,
            order: habits.length,
            group: null,
            icon: "Target",
            color: "#5B8DEF",
            isActive: true,
            archivedAt: null,
            createdAt: Date.now(),
          });
          window.dispatchEvent(
            new CustomEvent("w:toast", {
              detail: `[ HABIT CREATED ] - ${action.title} (${(action.period || "daily").toUpperCase()})`,
            })
          );
          onClose();
          break;
        }

        case "DELETE_HABIT": {
          if (!action.targetHabit) return;
          const { deleteHabit } = await import("../../../features/habits/services/habitService");
          await deleteHabit(action.targetHabit.id);
          window.dispatchEvent(
            new CustomEvent("w:toast", {
              detail: `[ HABIT DELETED ] - ${action.targetHabit.title}`,
            })
          );
          onClose();
          break;
        }
      }
    } catch (err: any) {
      console.error("[CommandPalette] Direct action error:", err);
      window.dispatchEvent(
        new CustomEvent("w:toast", {
          detail: `[ ACTION FAILED ] - ${err?.message || "Unknown error"}`,
        })
      );
    } finally {
      setExecuting(false);
    }
  }, [executing, habits.length, todos.length, dailyResetTime, onClose]);

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
        id: "page-manual",
        label: "Field Manual",
        icon: HelpCircle,
        category: "pages",
        action: () => { navigate("/manual"); onClose(); },
        keywords: ["manual", "help", "guide", "instructions", "docs", "features", "rules", "shortcuts", "info"],
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
  }, [navigate, onClose, habits, todos, onOpenNewHabit, onOpenNewTodo, location.pathname]);

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

  // ── Natural Language Direct Action ────────────────────────────
  const parsedAction = useMemo(() => {
    return parseNaturalCommand(query, habits, todos);
  }, [query, habits, todos]);

  const directActionItem: CommandItem | null = useMemo(() => {
    if (!parsedAction) return null;
    let icon = Plus;
    let category: CommandCategory = "actions";
    let accent = "#5B8DEF";

    if (parsedAction.type.startsWith("DELETE")) {
      icon = Trash2;
      accent = "#ff4d4d";
    } else if (parsedAction.priority && PRIORITY_CONFIG[parsedAction.priority]) {
      accent = PRIORITY_CONFIG[parsedAction.priority].color;
    }

    return {
      id: "direct-action-item",
      label: parsedAction.badgeText,
      icon,
      category,
      accent,
      action: () => handleExecuteDirectAction(parsedAction),
      keywords: [],
    };
  }, [parsedAction, handleExecuteDirectAction]);

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
  const flatFiltered = useMemo(() => {
    const regular = grouped.flatMap((g) => g.items);
    if (directActionItem) {
      return [directActionItem, ...regular];
    }
    return regular;
  }, [grouped, directActionItem]);

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
          playMechanicalClick();
          setSelectedIndex((i) => {
            const current = isNaN(i) ? 0 : i;
            return (current + 1) % flatFiltered.length;
          });
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (flatFiltered.length > 0) {
          playMechanicalClick();
          setSelectedIndex((i) => {
            const current = isNaN(i) ? 0 : i;
            return (current - 1 + flatFiltered.length) % flatFiltered.length;
          });
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatFiltered.length > 0 && !isNaN(selectedIndex)) {
          playMechanicalClick();
          flatFiltered[selectedIndex]?.action();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, flatFiltered, selectedIndex]);

  // ── Render ───────────────────────────────────────────────────
  let runningIndex = parsedAction ? 1 : 0;

  return (
    <motion.div 
      className="command-palette__backdrop" 
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      <motion.div
        layout
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: -16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        transition={SPRING_MODAL}
      >
        <div className="command-palette__input-row">
          <Search size={14} strokeWidth={1.5} />
          <input
            ref={inputRef}
            className="command-palette__input t-body"
            type="text"
            placeholder="Search or type: 'new todo...', 'new habit...', 'delete task'..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="command-palette__results">
          {parsedAction && (
            <button
              className={`command-palette__direct-action t-body${
                selectedIndex === 0 ? " command-palette__direct-action--selected" : ""
              }${
                parsedAction.type.startsWith("DELETE")
                  ? " command-palette__direct-action--delete"
                  : ""
              }`}
              onClick={() => handleExecuteDirectAction(parsedAction)}
              onMouseEnter={() => setSelectedIndex(0)}
            >
              {parsedAction.type.startsWith("DELETE") ? (
                <Trash2 size={16} strokeWidth={1.5} style={{ color: "#ff4d4d" }} />
              ) : (
                <Plus size={16} strokeWidth={1.5} style={{ color: "#5B8DEF" }} />
              )}
              <div className="command-palette__direct-action-info">
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    className="command-palette__direct-badge"
                    style={{
                      color: parsedAction.type.startsWith("DELETE")
                        ? "#ff4d4d"
                        : "#5B8DEF",
                    }}
                  >
                    [ {parsedAction.badgeText} ]
                  </span>
                  <span className="command-palette__direct-title">{parsedAction.title}</span>
                </div>
                {parsedAction.detailsHint && (
                  <span className="command-palette__direct-hint">{parsedAction.detailsHint}</span>
                )}
              </div>
              <span className="command-palette__item-shortcut t-meta">[ ENTER TO EXECUTE ]</span>
            </button>
          )}

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
                        onClick={() => {
                          playMechanicalClick();
                          item.action();
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        {idx === selectedIndex && (
                          <motion.div
                            layoutId="cmd-palette-active-pill"
                            className="command-palette__item-active-bg"
                            transition={SPRING_LAYOUT}
                          />
                        )}
                        {item.iconIsDynamic ? (
                          <LucideIcon
                            name={item.icon as string}
                            size={14}
                            style={item.accent ? { color: item.accent, position: "relative", zIndex: 1 } : { position: "relative", zIndex: 1 }}
                          />
                        ) : (
                          (() => {
                            const Icon = item.icon as LucideIconType;
                            return <Icon size={14} strokeWidth={1.5} style={item.accent ? { color: item.accent, position: "relative", zIndex: 1 } : { position: "relative", zIndex: 1 }} />;
                          })()
                        )}
                        <span className="command-palette__item-text" style={{ position: "relative", zIndex: 1 }}>{item.label}</span>
                        {idx === selectedIndex && (
                          <span className="command-palette__item-shortcut t-meta" style={{ position: "relative", zIndex: 1 }}>[ ENTER ]</span>
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
      </motion.div>
    </motion.div>
  );
}
