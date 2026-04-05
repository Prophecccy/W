import { useState, ReactNode } from "react";
import { LucideIcon } from "../../../../shared/components/IconPicker/LucideIcon";
import "./HabitGroupHeader.css";

interface HabitGroupHeaderProps {
  title: string;
  defaultExpanded?: boolean;
  children: ReactNode;
  count?: number;
}

export function HabitGroupHeader({ title, defaultExpanded = true, children, count }: HabitGroupHeaderProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="habit-group-section">
      <button 
        className="habit-group-header t-label"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="habit-group-header__left">
          <LucideIcon name={expanded ? "ChevronDown" : "ChevronRight"} size={16} />
          <span>[ {title.toUpperCase()} ]</span>
        </div>
        {count !== undefined && (
          <span className="habit-group-header__count">{count}</span>
        )}
      </button>
      
      {expanded && (
        <div className="habit-group-content">
          {children}
        </div>
      )}
    </div>
  );
}
