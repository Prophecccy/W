import { useState, useEffect, useCallback, useRef } from "react";
import { User as FirebaseUser, signInAnonymously } from "firebase/auth";
import { auth } from "../../../shared/config/firebase";
import { signInWithGoogle, signOut, onAuthStateChanged } from "../services/authService";

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [isDriveLinked, setIsDriveLinked] = useState<boolean>(() => {
    return localStorage.getItem("driveLinked") === "true";
  });
  const restoringRef = useRef(false);

  useEffect(() => {
    const handleLinked = async () => {
      console.info("[W Auth Hook] Google Drive linked event captured. Synchronizing state to true.");
      setIsDriveLinked(true);
      if (auth.currentUser) {
        try {
          const { updateUserDoc } = await import("../services/userService");
          await updateUserDoc(auth.currentUser.uid, { driveLinked: true } as any);
        } catch (err) {
          console.error("[W Auth Hook] Failed to update user doc with driveLinked: true:", err);
        }
      }
      try {
        const { getValidAccessToken, pullNotesFromDrive } = await import("../../../shared/services/googleDriveService");
        const accessToken = await getValidAccessToken();
        if (accessToken) {
          await pullNotesFromDrive(accessToken);
        }
      } catch (err) {
        console.error("[W Auth Hook] Failed to pull notes from Drive on link:", err);
      }
    };
    const handleUnlinked = () => {
      console.info("[W Auth Hook] Google Drive unlinked event captured. Synchronizing state to false.");
      setIsDriveLinked(false);
    };

    window.addEventListener("w:gdrive-linked", handleLinked);
    window.addEventListener("w:gdrive-unlinked", handleUnlinked);

    return () => {
      window.removeEventListener("w:gdrive-linked", handleLinked);
      window.removeEventListener("w:gdrive-unlinked", handleUnlinked);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
      setIsDriveLinked(localStorage.getItem("driveLinked") === "true");
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
    } catch (err: unknown) {
      console.error("[W Auth] Sign-out failed:", err);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const devSkip = useCallback(async () => {
    if (window.location.hostname === "localhost") {
      try {
        // Use real Firebase Anonymous Auth — creates a genuine auth session
        // so Firestore operations receive a valid request.auth token.
        const result = await signInAnonymously(auth);
        localStorage.setItem("w-auth-mock", "true");
        console.log("[W Auth] Dev-skip: anonymous sign-in successful, uid:", result.user.uid);
        // onAuthStateChanged listener will pick up the user automatically
      } catch (err) {
        console.error("[W Auth] Dev-skip anonymous sign-in failed:", err);
      }
    }
  }, []);

  useEffect(() => {
    // Auto-restore: if previously dev-skipped and no user yet, sign in anonymously again
    if (window.location.hostname === "localhost" && localStorage.getItem("w-auth-mock") && !user && !loading && !restoringRef.current) {
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
  };
}
