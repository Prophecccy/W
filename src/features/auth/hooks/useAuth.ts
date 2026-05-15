import { useState, useEffect, useCallback } from "react";
import { User as FirebaseUser, signInAnonymously } from "firebase/auth";
import { auth } from "../../../shared/config/firebase";
import { signInWithGoogle, signOut, onAuthStateChanged } from "../services/authService";

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

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
    if (window.location.hostname === "localhost" && localStorage.getItem("w-auth-mock") && !user && !loading) {
      signInAnonymously(auth).catch((err) => {
        console.error("[W Auth] Dev-skip auto-restore failed:", err);
        localStorage.removeItem("w-auth-mock");
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
  };
}
