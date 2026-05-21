import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import "./GDriveLockout.css";

interface GDriveLockoutProps {
  mode?: "page" | "card";
}

export function GDriveLockout({ mode = "page" }: GDriveLockoutProps) {
  const navigate = useNavigate();

  return (
    <div className={`gdrive-lockout gdrive-lockout--${mode}`}>
      <div className="gdrive-lockout__content">
        <div className="gdrive-lockout__icon-wrapper">
          <Lock className="gdrive-lockout__icon" size={mode === "page" ? 36 : 28} />
        </div>
        <h2 className="gdrive-lockout__title t-label">[ SYNC REQUIRED ]</h2>
        <p className="gdrive-lockout__subtitle t-body">
          {mode === "page"
            ? "Since W is architected as Local-First, Google Drive backup must be activated to secure your daily notes and logs. This protects your history against local data loss or corruption."
            : "Google Drive backup is required to unlock this feature. Please connect your Google account to secure your daily logs."
          }
        </p>
        <button
          className="gdrive-lockout__btn t-meta"
          onClick={() => navigate("/settings")}
        >
          [ GO TO SETTINGS ]
        </button>
      </div>
    </div>
  );
}
