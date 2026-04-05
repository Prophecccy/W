import { useState, useEffect } from "react";
import { useAuthContext } from "../../auth/context";
import { getUserDoc } from "../../auth/services/userService";
import { signOut } from "../../auth/services/authService";
import { User } from "../../../shared/types";
import { LogOut, User as UserIcon } from "lucide-react";

export function AccountSection() {
  const { user } = useAuthContext();
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
      </div>
    </div>
  );
}
