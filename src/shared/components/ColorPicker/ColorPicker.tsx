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
  return (
    <div className="color-picker-component">
      <div className="color-picker-component__grid">
        {PRESET_COLORS.map((c) => {
          const isSelected = selectedColor === c;
          return (
            <button
              key={c}
              type="button"
              className={`color-picker-component__btn ${
                isSelected ? "color-picker-component__btn--active" : ""
              }`}
              style={{ background: c }}
              onClick={() => onSelect(c)}
            />
          );
        })}
        {/* Native color picker for custom options */}
        <div 
          className="color-picker-component__custom-wrap" 
          title="Custom Color"
        >
          <input
            type="color"
            className="color-picker-component__native"
            value={selectedColor}
            onChange={(e) => onSelect(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
