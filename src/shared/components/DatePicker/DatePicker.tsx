import { useState, useEffect, useRef } from "react";
import { getToday, addDays } from "../../utils/dateUtils";
import { LucideIcon } from "../IconPicker/LucideIcon";
import "./DatePicker.css";

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  min?: string; // YYYY-MM-DD
  disabled?: boolean;
  placeholder?: string;
  dailyResetTime?: string;
}

export function DatePicker({
  value,
  onChange,
  min,
  disabled = false,
  placeholder = "SELECT DATE...",
  dailyResetTime
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const today = getToday(undefined, dailyResetTime);
  const effectiveMin = min || today;

  // We keep track of the month/year currently shown in the picker grid
  const [gridDate, setGridDate] = useState(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    const [y, m] = effectiveMin.split("-").map(Number);
    return new Date(y, m - 1, 1);
  });

  // Sync grid view month with current value if it changes externally
  useEffect(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      setGridDate(new Date(y, m - 1, 1));
    } else {
      const [y, m] = effectiveMin.split("-").map(Number);
      setGridDate(new Date(y, m - 1, 1));
    }
  }, [value, effectiveMin]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const year = gridDate.getFullYear();
  const month = gridDate.getMonth(); // 0-indexed

  const minDate = new Date(effectiveMin + "T12:00:00");
  const isPrevMonthDisabled = 
    year < minDate.getFullYear() || 
    (year === minDate.getFullYear() && month <= minDate.getMonth());

  // Month navigation
  const prevMonth = () => {
    if (isPrevMonthDisabled) return;
    setGridDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setGridDate(new Date(year, month + 1, 1));
  };

  const monthNames = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
  ];

  // Helper: check if a date string is before the minimum date
  const isDateDisabled = (dateStr: string) => {
    if (!effectiveMin) return false;
    return dateStr < effectiveMin;
  };

  // Generate calendar grid cells
  const getGridCells = () => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells = [];

    // Empty slots for start of month
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({ day: 0, dateStr: "", isCurrentMonth: false });
    }

    // Days of current month
    for (let day = 1; day <= totalDays; day++) {
      const mStr = String(month + 1).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      const dateStr = `${year}-${mStr}-${dStr}`;
      cells.push({
        day,
        dateStr,
        isCurrentMonth: true
      });
    }

    return cells;
  };

  // Preset handlers
  // today is already defined at top of component
  const presets = [
    { label: "TODAY", date: today },
    { label: "TOMORROW", date: addDays(today, 1) },
    { label: "+3 DAYS", date: addDays(today, 3) },
    { label: "+1 WEEK", date: addDays(today, 7) }
  ];

  const handleSelect = (dateStr: string) => {
    if (isDateDisabled(dateStr)) return;
    onChange(dateStr);
    setIsOpen(false);
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    const monthsShort = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return `${d} ${monthsShort[m - 1]} ${y}`;
  };

  return (
    <div className="w-datepicker" ref={containerRef}>
      <div
        className={`w-datepicker__trigger ${disabled ? "disabled" : ""} ${isOpen ? "open" : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className="w-datepicker__value t-data">
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <LucideIcon name="Calendar" size={14} className="w-datepicker__icon" />
      </div>

      {isOpen && (
        <div className="w-datepicker__popover">
          {/* Quick Presets */}
          <div className="w-datepicker__presets">
            {presets.map((preset) => {
              const disabledPreset = isDateDisabled(preset.date);
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`w-datepicker__preset-btn ${disabledPreset ? "disabled" : ""} ${value === preset.date ? "active" : ""}`}
                  onClick={() => !disabledPreset && handleSelect(preset.date)}
                  disabled={disabledPreset}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Month Navigator Header */}
          <div className="w-datepicker__header">
            <button 
              type="button" 
              className={`w-datepicker__nav-btn ${isPrevMonthDisabled ? "disabled" : ""}`} 
              onClick={prevMonth}
              disabled={isPrevMonthDisabled}
            >
              [ &lt; ]
            </button>
            <span className="w-datepicker__month-title t-label">
              {monthNames[month]} {year}
            </span>
            <button type="button" className="w-datepicker__nav-btn" onClick={nextMonth}>
              [ &gt; ]
            </button>
          </div>

          {/* Days Grid */}
          <div className="w-datepicker__grid">
            {/* Weekdays */}
            {["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map((day) => (
              <div key={day} className="w-datepicker__weekday t-meta">
                {day}
              </div>
            ))}

            {/* Days */}
            {getGridCells().map((cell, idx) => {
              if (cell.day === 0) {
                return <div key={`empty-${idx}`} className="w-datepicker__day empty" />;
              }

              const isDisabled = isDateDisabled(cell.dateStr);
              const isSelected = value === cell.dateStr;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  className={`w-datepicker__day ${isDisabled ? "disabled" : ""} ${isSelected ? "active" : ""}`}
                  onClick={() => !isDisabled && handleSelect(cell.dateStr)}
                  disabled={isDisabled}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
