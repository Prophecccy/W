import { useState, useEffect, useRef } from "react";
import { Pipette } from "lucide-react";
import "./ColorPicker.css";

const PRESET_COLORS = [
  "#5B8DEF", "#E8736C", "#4ade80", "#c084fc", "#fbbf24",
  "#f472b6", "#2dd4bf", "#818cf8", "#f87171", "#a3e635"
];

interface ColorPickerProps {
  selectedColor: string;
  onSelect: (color: string) => void;
}

export function ColorPicker({ selectedColor, onSelect }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempColor, setTempColor] = useState(selectedColor);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTempColor(selectedColor);
  }, [selectedColor]);

  // Live preview: apply tempColor globally when open, revert to selectedColor when closed
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
    const targetColor = isOpen ? tempColor : selectedColor;

    document.documentElement.style.setProperty("--accent", targetColor);

    if (isTauri) {
      import("@tauri-apps/api/event").then(({ emit }) => {
        emit("color-preview", targetColor).catch(() => {});
      }).catch(console.error);
    }
  }, [tempColor, isOpen, selectedColor]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setTempColor(selectedColor);
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, selectedColor]);

  const isCustomActive = !PRESET_COLORS.includes(tempColor.toUpperCase()) && 
                         !PRESET_COLORS.includes(tempColor.toLowerCase());

  const handleConfirm = () => {
    onSelect(tempColor);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setTempColor(selectedColor);
    setIsOpen(false);
  };

  return (
    <div className="color-picker-component" ref={popoverRef}>
      {!isOpen ? (
        <button
          className="color-picker-trigger"
          style={{ background: selectedColor }}
          onClick={() => setIsOpen(true)}
          title="Pick an accent color"
        />
      ) : (
        <div className="color-picker-popover">
          <div className="color-picker-component__grid">
            {PRESET_COLORS.map((c) => {
              const isSelected = tempColor.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  className={`color-picker-component__btn ${
                    isSelected ? "color-picker-component__btn--active" : ""
                  }`}
                  style={{ background: c }}
                  onClick={() => setTempColor(c)}
                />
              );
            })}
            
            {/* Native color picker for custom options */}
            <div 
              className={`color-picker-component__custom-wrap ${
                isCustomActive ? "color-picker-component__custom-wrap--active" : ""
              }`}
              title="Custom Color"
            >
              <div className="color-picker-component__custom-preview" style={{ background: isCustomActive ? tempColor : 'transparent' }} />
              <Pipette size={14} className="color-picker-component__pipette" />
              <input
                type="color"
                className="color-picker-component__native"
                value={tempColor}
                onChange={(e) => setTempColor(e.target.value)}
              />
            </div>
          </div>
          
          <div className="color-picker-actions">
            <button className="t-label color-picker-cancel" onClick={handleCancel}>
              [ CANCEL ]
            </button>
            <button 
              className="t-label color-picker-confirm" 
              onClick={handleConfirm} 
              style={{ background: tempColor }}
            >
              [ CONFIRM ]
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
