import { useState, useEffect, useCallback, useRef } from "react";
import { auth, LocalUser as FirebaseUser, signInAnonymously } from "../../../shared/config/firebase";
import { signInWithGoogle, signOut, onAuthStateChanged, restoreWebBffSession } from "../services/authService";
import { isSyncCapableContext, isTauri } from "../../../shared/utils/tauri";

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [isDriveLinked, setIsDriveLinked] = useState<boolean>(() => {
    return localStorage.getItem("driveLinked") === "true";
  });
  const [isDriveSessionExpired, setIsDriveSessionExpired] = useState<boolean>(false);
  const restoringRef = useRef(false);

  useEffect(() => {
    if (!isSyncCapableContext()) return;
    let active = true;
    async function checkInitialToken() {
      if (localStorage.getItem("driveLinked") === "true") {
        try {
          const { getValidAccessToken } = await import("../../../shared/services/googleDriveService");
          const token = await getValidAccessToken();
          if (active && !token) {
            setIsDriveSessionExpired(true);
          }
        } catch {
          if (active) setIsDriveSessionExpired(true);
        }
      }
    }
    checkInitialToken();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    const handleLinked = async () => {
      console.info("[W Auth Hook] Google Drive linked event captured. Synchronizing state to true.");
      setIsDriveLinked(true);
      setIsDriveSessionExpired(false);
      if (auth.currentUser && isSyncCapableContext()) {
        try {
          const { updateUserDoc } = await import("../services/userService");
          await updateUserDoc(auth.currentUser.uid, { driveLinked: true } as any);
        } catch (err) {
          console.error("[W Auth Hook] Failed to update user doc with driveLinked: true:", err);
        }
      }
      if (!isSyncCapableContext()) return;
      try {
        const { getValidAccessToken, pullNotesFromDrive } = await import("../../../shared/services/googleDriveService");
        const accessToken = await getValidAccessToken();
        if (accessToken && auth.currentUser) {
          const { pullAndMergeFromGoogleDrive, syncToGoogleDrive } = await import("../../../shared/services/localDb");
          await pullAndMergeFromGoogleDrive(true);
          await pullNotesFromDrive(accessToken);
          await syncToGoogleDrive();
        }
      } catch (err) {
        console.error("[W Auth Hook] Failed to pull from Google Drive on link:", err);
      }
    };
    const handleUnlinked = () => {
      console.info("[W Auth Hook] Google Drive unlinked event captured. Synchronizing state to false.");
      setIsDriveLinked(false);
    };
    const handleSessionExpired = () => {
      console.warn("[W Auth Hook] Google Drive session expired event captured.");
      if (localStorage.getItem("driveLinked") === "true") {
        setIsDriveSessionExpired(true);
      }
    };

    window.addEventListener("w:gdrive-linked", handleLinked);
    window.addEventListener("w:gdrive-unlinked", handleUnlinked);
    window.addEventListener("w:gdrive-session-expired", handleSessionExpired);

    return () => {
      window.removeEventListener("w:gdrive-linked", handleLinked);
      window.removeEventListener("w:gdrive-unlinked", handleUnlinked);
      window.removeEventListener("w:gdrive-session-expired", handleSessionExpired);
    };
  }, []);

  // Hydrate Web/Mobile BFF HttpOnly cookie session on mount (including same-window redirect callbacks)
  useEffect(() => {
    if (typeof window === "undefined" || isTauri()) return;
    if (window.location.pathname === "/oauth-complete") return;

    const searchParams = new URLSearchParams(window.location.search);
    const authError = searchParams.get("auth_error");
    if (authError) {
      setError(`Google OAuth error (${authError}). Please try again.`);
      searchParams.delete("auth_error");
      const cleanQuery = searchParams.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (cleanQuery ? `?${cleanQuery}` : "")
      );
    }

    let active = true;
    setSigningIn(true);
    restoreWebBffSession()
      .then((restoredUser) => {
        if (!active) return;
        if (restoredUser) {
          setUser(restoredUser);
          setIsDriveLinked(true);
          setIsDriveSessionExpired(false);
        } else if (auth.currentUser?.email || localStorage.getItem("w_auth_user")) {
          localStorage.setItem("driveLinked", "false");
          setIsDriveLinked(false);
          setIsDriveSessionExpired(true);
        }
      })
      .finally(() => {
        if (active) {
          setSigningIn(false);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((firebaseUser: any) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser && isSyncCapableContext()) {
        const syncDriveIfLinked = async () => {
          const isLinked = localStorage.getItem("driveLinked") === "true";
          if (!isLinked) return;
          try {
            const { pullAndMergeFromGoogleDrive } = await import("../../../shared/services/localDb");
            await pullAndMergeFromGoogleDrive();
          } catch (err) {
            console.error("[W Auth Hook] Failed to sync from Google Drive on login:", err);
          }
        };
        syncDriveIfLinked();
      }
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
      setIsDriveLinked(localStorage.getItem("driveLinked") === "true");
      setIsDriveSessionExpired(false);
    } catch (err: unknown) {
      let message: string;
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === "string") {
        message = err;
      } else {
        try { message = JSON.stringify(err); } catch { message = String(err); }
      }
      console.error("[W Auth] Sign-in failed:", err);
      setError(message);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      localStorage.removeItem("w-auth-mock");
      await signOut();
      setIsDriveLinked(false);
      setIsDriveSessionExpired(false);
    } catch (err: unknown) {
      console.error("[W Auth] Sign-out failed:", err);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const devSkip = useCallback(async () => {
    if (!import.meta.env.DEV) return;
    try {
      const result = await signInAnonymously(auth);
      localStorage.setItem("w-auth-mock", "true");
      console.log("[W Auth] Dev-skip: anonymous sign-in successful, uid:", result.user.uid);
    } catch (err) {
      console.error("[W Auth] Dev-skip anonymous sign-in failed:", err);
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV && localStorage.getItem("w-auth-mock") && !user && !loading && !restoringRef.current) {
      restoringRef.current = true;
      signInAnonymously(auth).catch((err) => {
        console.error("[W Auth] Dev-skip auto-restore failed:", err);
        localStorage.removeItem("w-auth-mock");
      }).finally(() => {
        restoringRef.current = false;
      });
    }
  }, [user, loading]);

  return {
    user,
    loading,
    error,
    signingIn,
    signIn,
    signOut: handleSignOut,
    clearError,
    devSkip,
    isDriveLinked,
    setIsDriveLinked,
    isDriveSessionExpired,
  };
}
