import { ColorPicker } from "../../../shared/components/ColorPicker/ColorPicker";
import { Palette, Volume2 } from "lucide-react";
import { Settings, Aesthetics } from "../../../shared/types";

interface AppearanceSectionProps {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  aesthetics: Aesthetics;
  onUpdateAesthetics: (patch: Partial<Aesthetics>) => void;
}

export function AppearanceSection({ settings, onUpdate, aesthetics, onUpdateAesthetics }: AppearanceSectionProps) {
  const accentColor = aesthetics.desktop.accentColor;
  const completionSound = settings.completionSound;
  const lowGraphicsMode = settings.lowGraphicsMode;

  const handleColorChange = (color: string) => {
    document.documentElement.style.setProperty("--accent", color);
    onUpdateAesthetics({
      desktop: { ...aesthetics.desktop, accentColor: color },
      widget: { ...aesthetics.widget, accentColor: color },
      mobile: { ...aesthetics.mobile, accentColor: color },
    });
  };

  const handleSoundToggle = () => {
    onUpdate({ completionSound: !completionSound });
  };

  const handleGraphicsToggle = () => {
    const newVal = !lowGraphicsMode;
    if (newVal) {
      document.body.classList.add("low-graphics");
    } else {
      document.body.classList.remove("low-graphics");
    }
    onUpdate({ lowGraphicsMode: newVal });
  };

  return (
    <div className="settings-section" id="settings-appearance">
      <h2 className="settings-section__header t-label">[ APPEARANCE ]</h2>

      <div className="settings-section__content">
        {/* Accent Color */}
        <div className="settings-row">
          <div className="settings-row__label">
            <Palette size={14} strokeWidth={1.5} />
            <span className="t-body">Accent Color</span>
          </div>
          <ColorPicker selectedColor={accentColor} onSelect={handleColorChange} />
        </div>

        {/* Completion Sound */}
        <div className="settings-row">
          <div className="settings-row__label">
            <Volume2 size={14} strokeWidth={1.5} />
            <span className="t-body">Completion Sound</span>
          </div>
          <button
            className={`settings-toggle ${completionSound ? "settings-toggle--on" : ""}`}
            onClick={handleSoundToggle}
            aria-label="Toggle completion sound"
          >
            <span className="settings-toggle__knob" />
          </button>
        </div>

        {/* Low Graphics Mode */}
        <div className="settings-row">
          <div className="settings-row__label">
            <span style={{width: 14, display: 'inline-block'}} />
            <span className="t-body">Low Graphics Mode</span>
          </div>
          <button
            className={`settings-toggle ${lowGraphicsMode ? "settings-toggle--on" : ""}`}
            onClick={handleGraphicsToggle}
            aria-label="Toggle low graphics mode"
          >
            <span className="settings-toggle__knob" />
          </button>
        </div>
      </div>
    </div>
  );
}
