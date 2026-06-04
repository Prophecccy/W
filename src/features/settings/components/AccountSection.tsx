import { useState, useEffect } from "react";
import { useAuthContext } from "../../auth/context";
import { getUserDoc } from "../../auth/services/userService";
import { User } from "../../../shared/types";
import { LogOut, User as UserIcon } from "lucide-react";
import { clearOAuthTokens } from "../../../shared/services/googleDriveService";
import { GoogleDriveIcon } from "../../../shared/components/GoogleDriveIcon/GoogleDriveIcon";

export function AccountSection() {
  const { user, isDriveLinked, setIsDriveLinked, signIn, signOut, error, signingIn, clearError } = useAuthContext();
  const [userDoc, setUserDoc] = useState<User | null>(null);

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then(setUserDoc);
    }
  }, [user]);

  const handleSignOut = async () => {
    if (confirm("Are you sure you want to sign out?")) {
      await signOut();
    }
  };

  const handleLinkDrive = async () => {
    try {
      await signIn();
    } catch (err) {
      console.error("Failed to link Google Drive:", err);
    }
  };

  const handleUnlinkDrive = async () => {
    if (confirm("Are you sure you want to unlink Google Drive? Your local logs and notes remain fully secure, but cloud backup will be disabled and access to notes/logbook will be locked until reconnected.")) {
      await clearOAuthTokens();
      setIsDriveLinked(false);
    }
  };

  return (
    <div className="settings-section" id="settings-account">
      <h2 className="settings-section__header t-label">[ ACCOUNT ]</h2>

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
            <p className="t-body">{user?.displayName || "User"}</p>
            <p className="t-meta">{user?.email || "No email"}</p>
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
          <span>[ SIGN OUT ]</span>
        </button>

        <hr className="settings-divider" />

        <div className="settings-row">
          <div className="settings-row__label">
            <span className="t-meta" style={{ letterSpacing: "1px", fontWeight: 500 }}>GOOGLE DRIVE SYNC</span>
          </div>
          <div className="settings-row__action">
            {isDriveLinked ? (
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="t-meta" style={{ color: "#4ade80", fontWeight: 600 }}>[ CONNECTED ]</span>
                <button
                  className="settings-btn settings-btn--danger"
                  onClick={handleUnlinkDrive}
                >
                  <GoogleDriveIcon size={12} />
                  <span>[ UNLINK ]</span>
                </button>
              </div>
            ) : (
              <button
                className="settings-btn"
                style={{ color: "var(--accent)" }}
                onClick={handleLinkDrive}
                disabled={signingIn}
              >
                <GoogleDriveIcon size={12} />
                <span>{signingIn ? "[ LINKING... ]" : "[ LINK DRIVE ]"}</span>
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

