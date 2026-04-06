import { useState, useEffect, useCallback } from "react";
import { User as FirebaseUser } from "firebase/auth";
import { signInWithGoogle, signOut, onAuthStateChanged, handleRedirectResult } from "../services/authService";

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle redirect result (for Tauri production sign-in flow)
    handleRedirectResult().catch(() => {});

    const unsubscribe = onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      // Error handled by service
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      localStorage.removeItem("w-auth-mock");
      await signOut();
    } catch (error) {
      // Error handled by service
    }
  }, []);

  const devSkip = useCallback(() => {
    if (window.location.hostname === "localhost") {
      const mockUser = { uid: "dev-user", email: "dev@local.host", displayName: "Dev Admin" } as FirebaseUser;
      localStorage.setItem("w-auth-mock", "true");
      setUser(mockUser);
    }
  }, []);

  useEffect(() => {
    if (window.location.hostname === "localhost" && localStorage.getItem("w-auth-mock")) {
       setUser({ uid: "dev-user", email: "dev@local.host", displayName: "Dev Admin" } as FirebaseUser);
    }
  }, []);

  return {
    user,
    loading,
    signIn,
    signOut: handleSignOut,
    devSkip,
  };
}
