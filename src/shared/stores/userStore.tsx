import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuthContext } from "../../features/auth/context";
import { getUserDoc, updateUserDoc, ensureCycleDefaults } from "../../features/auth/services/userService";
import { User, Settings } from "../types";

// ─── Defaults for legacy users without cycle data ────────────────
export const CYCLE_DEFAULTS = {
  wakeUpTime: "07:00",
  bedTime: "23:00",
} as const;

// ─── Context shape ───────────────────────────────────────────────
interface UserStoreContextType {
  userDoc: User | null;
  loading: boolean;

  /** true if the user had no cycle data and was backfilled with defaults */
  needsCalibration: boolean;

  /** Dismiss the calibration banner (session-only) */
  dismissCalibration: () => void;

  /** Resolved wake/sleep — never undefined, always falls back to defaults */
  wakeUpTime: string;
  bedTime: string;

  /** Patch settings on the user doc (Firestore + local state) */
  updateSettings: (patch: Partial<Settings>) => Promise<void>;

  /** Full reload of the user doc from Firestore */
  reload: () => Promise<void>;

  /** Set the entire userDoc (used by Layout after onboarding) */
  setUserDoc: (doc: User) => void;
}

const UserStoreContext = createContext<UserStoreContextType | undefined>(undefined);

// ─── Provider ────────────────────────────────────────────────────
export function UserProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();
  const [userDoc, setUserDoc] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsCalibration, setNeedsCalibration] = useState(false);

  // ── Load user doc on auth change ─────────────────────────────
  const loadUser = useCallback(async () => {
    if (!user) {
      setUserDoc(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const doc = await getUserDoc(user.uid);
      if (doc) {
        // Backfill legacy users who have no cycle data
        const { patched, needsCalibration: needsCal } = ensureCycleDefaults(doc);
        if (needsCal) {
          // Persist the defaults to Firestore (fire-and-forget)
          updateUserDoc(user.uid, {
            settings: patched.settings,
          } as any).catch(console.error);
        }
        setUserDoc(patched);
        setNeedsCalibration(needsCal);
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
    if (!user || !userDoc) return;

    // Optimistic local update
    setUserDoc((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        settings: { ...prev.settings, ...patch },
      };
    });

    // Persist to Firestore using dot notation for partial settings update
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      updates[`settings.${key}`] = value;
    }
    await updateUserDoc(user.uid, updates as any);
  }, [user, userDoc]);

  const dismissCalibration = useCallback(() => {
    setNeedsCalibration(false);
  }, []);

  const reload = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  // ── Resolved values (never undefined) ────────────────────────
  const wakeUpTime = userDoc?.settings?.wakeUpTime || CYCLE_DEFAULTS.wakeUpTime;
  const bedTime = userDoc?.settings?.bedTime || CYCLE_DEFAULTS.bedTime;

  return (
    <UserStoreContext.Provider
      value={{
        userDoc,
        loading,
        needsCalibration,
        dismissCalibration,
        wakeUpTime,
        bedTime,
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
