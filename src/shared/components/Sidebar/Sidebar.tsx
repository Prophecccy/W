import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ListChecks,
  Clock,
  BarChart3,
  Settings,
  AlertTriangle,
  Download,
  Target,
  Lock,
} from "lucide-react";
import { FlameIcon } from "../FlameIcon/FlameIcon";
import { isTauri } from "../../utils/tauri";
import "./Sidebar.css";

interface SidebarProps {
  strikeCount?: number;
  globalStreak?: number;
  isLockdownActive?: boolean;
}

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/habits", icon: Target, label: "Habits" },
  { to: "/todos", icon: ListChecks, label: "Todos" },
  { to: "/clock", icon: Clock, label: "Clock" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar({ strikeCount = 0, globalStreak = 0, isLockdownActive = false }: SidebarProps) {
  const isWarning = strikeCount >= 3;
  const isLocked = strikeCount >= 5;
  return (
    <aside className="sidebar">
      <div className="sidebar__logo t-display">[ W ]</div>

      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `sidebar__link t-body${isActive ? " sidebar__link--active" : ""}`
            }
          >
            <item.icon size={16} strokeWidth={1.5} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__divider" />

      <div className="sidebar__stats">
        <span className="sidebar__stats-label t-label">QUICK STATS</span>
        <div className="sidebar__stat" title="Global App Streak">
          <FlameIcon streak={globalStreak} />
          <span className="t-data">{globalStreak}</span>
        </div>
        <div className={`sidebar__stat sidebar__stat--strikes${isWarning ? ' sidebar__stat--warning' : ''}${isLocked ? ' sidebar__stat--locked' : ''}`}>
          <AlertTriangle size={14} strokeWidth={1.5} />
          <span className="t-data">{strikeCount}/5</span>
        </div>
      </div>

      <div className="sidebar__divider" />

      {isLockdownActive && (
        <div className="sidebar__lockdown">
          <Lock size={12} className="sidebar__lockdown-icon" />
          <span className="sidebar__lockdown-text">LOCKDOWN</span>
        </div>
      )}

      {isLockdownActive && <div className="sidebar__divider" />}

      {!isTauri() && (
        <div style={{ padding: "0 10px 16px 10px" }}>
          <a 
            href="https://github.com/Prophecccy/W/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="sidebar__download-btn"
          >
            <Download size={14} />
            <span className="t-body">GET DESKTOP APP</span>
          </a>
        </div>
      )}
    </aside>
  );
}
