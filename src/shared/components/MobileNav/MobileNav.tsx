import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Target,
  ListChecks,
  BookOpen,
  Settings,
} from "lucide-react";
import "./MobileNav.css";

interface MobileNavProps {
  strikeCount?: number;
  strikeSystemEnabled?: boolean;
  habitsCount?: number;
  todosCount?: number;
  isLocked?: boolean;
  isFrozen?: boolean;
}

export function MobileNav({
  strikeCount = 0,
  strikeSystemEnabled = true,
  habitsCount = 0,
  todosCount = 0,
  isLocked = false,
  isFrozen = false,
}: MobileNavProps) {
  const isWarning = strikeCount >= 3;

  const navItems = [
    { to: "/", label: "Dash", icon: LayoutDashboard },
    { to: "/habits", label: "Habits", icon: Target, count: habitsCount },
    { to: "/todos", label: "Todos", icon: ListChecks, count: todosCount },
    { to: "/logbook", label: "Logs", icon: BookOpen },
    { to: "/settings", label: "Settings", icon: Settings, strikeBadge: strikeSystemEnabled && strikeCount > 0 ? `${strikeCount}/5` : undefined },
  ];

  return (
    <nav className={`mobile-nav ${isFrozen ? "mobile-nav--frozen" : ""}`} aria-label="Mobile Navigation">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={isLocked ? "#" : item.to}
          end={item.to === "/"}
          onClick={(e) => {
            if (isLocked) {
              e.preventDefault();
            }
          }}
          className={({ isActive }) =>
            `mobile-nav__link${isActive && !isLocked ? " mobile-nav__link--active" : ""}${isLocked ? " mobile-nav__link--disabled" : ""}`
          }
        >
          <div className="mobile-nav__icon-wrapper">
            <item.icon size={18} strokeWidth={1.75} />
            {item.strikeBadge && (
              <span className={`mobile-nav__badge ${isWarning ? "mobile-nav__badge--strike" : ""}`}>
                {item.strikeBadge}
              </span>
            )}
          </div>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
