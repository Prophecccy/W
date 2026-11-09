import { useAuthContext } from "../../auth/context";
import { LogOut, User as UserIcon } from "lucide-react";
import { GoogleDriveIcon } from "../../../shared/components/GoogleDriveIcon/GoogleDriveIcon";
import { useUserStore } from "../../../shared/stores/userStore";

export function AccountSection() {
  const { user, signIn, signOut, error, signingIn, clearError } = useAuthContext();
  const { userDoc } = useUserStore();

  const handleSignOut = async () => {
    if (confirm("Are you sure you want to sign out? This will disconnect your Google Drive sync, clear local session cache, and return to the login screen.")) {
      await signOut();
    }
  };

  return (
    <div className="settings-section" id="settings-account">
      <h2 className="settings-section__header t-label">[ ACCOUNT & STORAGE ]</h2>

      <div className="settings-section__content">
        <div className="settings-account">
          <div className="settings-account__avatar">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="Profile"
                className="settings-account__photo"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="settings-account__photo-placeholder">
                <UserIcon size={24} strokeWidth={1.5} />
              </div>
            )}
          </div>

          <div className="settings-account__info">
            <p className="t-body">{user?.displayName || (user?.email ? "Authenticated User" : "Dev User")}</p>
            <p className="t-meta">{user?.email || "Offline / Mock Account"}</p>
            {userDoc && (
              <p className="t-meta" style={{ marginTop: 4, color: "var(--text-muted)" }}>
                MEMBER SINCE {new Date(userDoc.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase()}
              </p>
            )}
          </div>
        </div>

        <button
          className="settings-btn settings-btn--danger"
          onClick={handleSignOut}
        >
          <LogOut size={12} strokeWidth={2} />
          <span>[ SIGN OUT / DISCONNECT ]</span>
        </button>

        <hr className="settings-divider" />

        <div className="settings-row">
          <div className="settings-row__label">
            <span className="t-meta" style={{ letterSpacing: "1px", fontWeight: 500 }}>SOVEREIGN CLOUD SYNC</span>
            <span className="t-meta" style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px", display: "block" }}>
              {user?.email
                ? `Directly locked & mirrored to ${user.email}'s personal Google Drive container.`
                : "Offline development mode. Cloud sync is disabled."}
            </span>
          </div>
          <div className="settings-row__action">
            {user?.email ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <GoogleDriveIcon size={14} />
                <span className="t-meta" style={{ color: "#4ade80", fontWeight: 600 }}>[ CONNECTED & LOCKED ]</span>
              </div>
            ) : (
              <button
                className="settings-btn"
                style={{ color: "var(--accent)" }}
                onClick={signIn}
                disabled={signingIn}
              >
                <GoogleDriveIcon size={12} />
                <span>{signingIn ? "[ CONNECTING... ]" : "[ SIGN IN WITH GOOGLE ]"}</span>
              </button>
            )}
          </div>
        </div>

        {error && (
          <div
            className="t-meta"
            style={{
              marginTop: "16px",
              color: "var(--strike-red)",
              border: "1px solid var(--strike-red)",
              padding: "8px 12px",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "var(--font-mono, monospace)",
              userSelect: "none"
            }}
            onClick={clearError}
          >
            <span>⚠️ ERROR: {error.toUpperCase()}</span>
            <span style={{ opacity: 0.5 }}>[ DISMISS ]</span>
          </div>
        )}
      </div>
    </div>
  );
}

