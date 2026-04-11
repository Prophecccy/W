import { useState, useEffect, useCallback } from "react";
import { User as FirebaseUser } from "firebase/auth";
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
      const message = err instanceof Error ? err.message : "Sign-in failed. Please try again.";
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

  const devSkip = useCallback(() => {
    if (window.location.hostname === "localhost") {
      const mockUser = { uid: "dev-user", email: "dev@local.host", displayName: "Dev Admin", photoURL: "" } as FirebaseUser;
      localStorage.setItem("w-auth-mock", "true");
      setUser(mockUser);
    }
  }, []);

  useEffect(() => {
    if (window.location.hostname === "localhost" && localStorage.getItem("w-auth-mock")) {
       setUser({ uid: "dev-user", email: "dev@local.host", displayName: "Dev Admin", photoURL: "" } as FirebaseUser);
    }
  }, []);

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
