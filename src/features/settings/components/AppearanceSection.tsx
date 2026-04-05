import { useState, useEffect } from "react";
import { useAuthContext } from "../../auth/context";
import { getUserDoc, updateUserDoc } from "../../auth/services/userService";
import { ColorPicker } from "../../../shared/components/ColorPicker/ColorPicker";
import { useToast } from "../../../shared/components/Toast/Toast";
import { Palette, Volume2 } from "lucide-react";

export function AppearanceSection() {
  const { user } = useAuthContext();
  const { showToast } = useToast();
  const [accentColor, setAccentColor] = useState("#5B8DEF");
  const [completionSound, setCompletionSound] = useState(true);
  const [lowGraphicsMode, setLowGraphicsMode] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then((doc) => {
        if (doc) {
          setAccentColor(doc.aesthetics.desktop.accentColor);
          setCompletionSound(doc.settings.completionSound ?? true);
          setLowGraphicsMode(doc.settings.lowGraphicsMode ?? false);
          setLoaded(true);
        }
      });
    }
  }, [user]);

  const handleColorChange = async (color: string) => {
    setAccentColor(color);
    document.documentElement.style.setProperty("--accent", color);
    if (user) {
      try {
        await updateUserDoc(user.uid, {
          "aesthetics.desktop.accentColor": color,
          "aesthetics.widget.accentColor": color,
          "aesthetics.mobile.accentColor": color,
        } as any);
      } catch {
        showToast("[ FAILED TO SAVE COLOR ]");
      }
    }
  };

  const handleSoundToggle = async () => {
    const newVal = !completionSound;
    setCompletionSound(newVal);
    if (user) {
      try {
        await updateUserDoc(user.uid, {
          "settings.completionSound": newVal,
        } as any);
        showToast(newVal ? "[ SOUND ON ]" : "[ SOUND OFF ]");
      } catch {
        showToast("[ FAILED TO SAVE ]");
        setCompletionSound(!newVal);
      }
    }
  };

  const handleGraphicsToggle = async () => {
    const newVal = !lowGraphicsMode;
    setLowGraphicsMode(newVal);
    
    if (newVal) {
      document.body.classList.add("low-graphics");
    } else {
      document.body.classList.remove("low-graphics");
    }

    if (user) {
      try {
        await updateUserDoc(user.uid, {
          "settings.lowGraphicsMode": newVal,
        } as any);
        showToast(newVal ? "[ LOW GRAPHICS ON ]" : "[ LOW GRAPHICS OFF ]");
      } catch {
        showToast("[ FAILED TO SAVE ]");
        setLowGraphicsMode(!newVal);
        
        if (!newVal) {
          document.body.classList.add("low-graphics");
        } else {
          document.body.classList.remove("low-graphics");
        }
      }
    }
  };

  if (!loaded) return null;

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
            <span style={{width: 14, display: 'inline-block'}} /> {/* placeholder to align if no icon */}
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
