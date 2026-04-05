import { useState, useMemo } from "react";
import { LucideIcon } from "./LucideIcon";
import "./IconPicker.css";

// 65 curated minimalist icons suitable for productivity habits
const ICONS = [
  "Activity", "AlarmClock", "AlertCircle", "AlignLeft", "Anchor", 
  "Aperture", "Archive", "Award", "BadgeIndianRupee", "BadgePercent", 
  "Banknote", "BatteryCharging", "Bell", "BicepsFlexed", "BookOpen", 
  "Bookmark", "BoxSelect", "Briefcase", "Brush", "Calculator", 
  "CalendarDays", "Camera", "CheckCircle2", "ChevronUpSquare", "CloudRain", 
  "Coffee", "Command", "Compass", "Cpu", "CreditCard", 
  "Crosshair", "Database", "Dumbbell", "Edit3", "Eye", 
  "Feather", "FileText", "Filter", "Flame", "Focus", 
  "Folder", "Gamepad2", "Gauge", "Gift", "Glasses", 
  "Globe", "GraduationCap", "Hammer", "Headphones", "Heart", 
  "Image", "Inbox", "Key", "Laptop", "Layout", 
  "Lightbulb", "Link", "List", "Lock", "Mail", 
  "Map", "MessageSquare", "Monitor", "Moon", "Music"
];

interface IconPickerProps {
  selectedIcon: string;
  onSelect: (iconName: string) => void;
}

export function IconPicker({ selectedIcon, onSelect }: IconPickerProps) {
  const [search, setSearch] = useState("");

  const filteredIcons = useMemo(() => {
    if (!search) return ICONS;
    const lower = search.toLowerCase();
    return ICONS.filter((icon) => icon.toLowerCase().includes(lower));
  }, [search]);

  return (
    <div className="icon-picker">
      <input
        type="text"
        className="icon-picker__search t-data"
        placeholder="Search icons..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="icon-picker__grid">
        {filteredIcons.map((icon) => {
          const isSelected = selectedIcon === icon;
          return (
            <button
              key={icon}
              type="button"
              className={`icon-picker__btn ${isSelected ? "icon-picker__btn--active" : ""}`}
              onClick={() => onSelect(icon)}
              title={icon}
            >
              <LucideIcon name={icon} size={24} />
            </button>
          );
        })}
        {filteredIcons.length === 0 && (
          <div className="t-meta icon-picker__empty">No icons found.</div>
        )}
      </div>
    </div>
  );
}
