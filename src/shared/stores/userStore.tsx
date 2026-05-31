import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuthContext } from "../../features/auth/context";
import { getUserDoc, updateUserDoc } from "../../features/auth/services/userService";
import { User, Settings } from "../types";


// ─── Context shape ───────────────────────────────────────────────
interface UserStoreContextType {
  userDoc: User | null;
  loading: boolean;

  /** Patch settings on the user doc (Firestore + local state) */
  updateSettings: (patch: Partial<Settings>) => Promise<void>;

  /** Full reload of the user doc from Firestore */
  reload: () => Promise<void>;

  /** Set the entire userDoc (used by Layout after onboarding) */
  setUserDoc: (doc: User) => void;
}

export const UserStoreContext = createContext<UserStoreContextType | undefined>(undefined);

// ─── Provider ────────────────────────────────────────────────────
export function UserProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();
  const [userDoc, setUserDoc] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Load user doc on auth change ─────────────────────────────
  const loadUser = useCallback(async () => {
    if (!user) {
      setUserDoc(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("w_daily_reset_time");
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const doc = await getUserDoc(user.uid);
      if (doc) {
        if (typeof window !== "undefined" && doc.settings?.dailyResetTime) {
          localStorage.setItem("w_daily_reset_time", doc.settings.dailyResetTime);
        }
        setUserDoc(doc);
      } else {
        setUserDoc(null);
      }
    } catch (err) {
      console.error("[UserStore] Failed to load user doc:", err);
      setUserDoc(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // ── Actions ──────────────────────────────────────────────────
  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    if (!user) return;

    // Keep track of the original settings for reversion
    let originalSettings: Settings | undefined;
    setUserDoc((prev) => {
      if (!prev) return prev;
      originalSettings = prev.settings;
      return {
        ...prev,
        settings: { ...prev.settings, ...patch },
      };
    });

    const oldDailyReset = typeof window !== "undefined" ? localStorage.getItem("w_daily_reset_time") : null;
    if (typeof window !== "undefined" && patch.dailyResetTime) {
      localStorage.setItem("w_daily_reset_time", patch.dailyResetTime);
    }

    try {
      // Persist to Firestore using dot notation for partial settings update
      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        updates[`settings.${key}`] = value;
      }
      await updateUserDoc(user.uid, updates as any);
    } catch (err) {
      console.error("[UserStore] Failed to persist settings to Firestore. Reverting optimistic update.", err);
      // Revert dailyResetTime in localStorage
      if (typeof window !== "undefined") {
        if (oldDailyReset) {
          localStorage.setItem("w_daily_reset_time", oldDailyReset);
        } else {
          localStorage.removeItem("w_daily_reset_time");
        }
      }
      // Revert local state
      if (originalSettings) {
        setUserDoc((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            settings: originalSettings!,
          };
        });
      }
      throw err;
    }
  }, [user]);


  const reload = useCallback(async () => {
    await loadUser();
  }, [loadUser]);


  return (
    <UserStoreContext.Provider
      value={{
        userDoc,
        loading,
        updateSettings,
        reload,
        setUserDoc,
      }}
    >
      {children}
    </UserStoreContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────
export function useUserStore() {
  const ctx = useContext(UserStoreContext);
  if (!ctx) {
    throw new Error("useUserStore must be used within a <UserProvider>");
  }
  return ctx;
}
