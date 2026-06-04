import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuthContext } from "../../features/auth/context";
import { getUserDoc, updateUserDoc } from "../../features/auth/services/userService";
import { User, Settings } from "../types";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";


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

  // ── Listen to user doc on auth change (onSnapshot) ───────────
  useEffect(() => {
    if (!user) {
      setUserDoc(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("w_daily_reset_time");
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    const userRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const docData = snap.data() as User;
          if (typeof window !== "undefined" && docData.settings?.dailyResetTime) {
            localStorage.setItem("w_daily_reset_time", docData.settings.dailyResetTime);
          }
          setUserDoc(docData);
        } else {
          setUserDoc(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("[UserStore] onSnapshot failed:", err);
        setUserDoc(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

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
    if (!user) return;
    try {
      const docData = await getUserDoc(user.uid);
      if (docData) setUserDoc(docData);
    } catch (err) {
      console.error("[UserStore] reload failed:", err);
    }
  }, [user]);


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
