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
      await signOut();
    } catch (error) {
      // Error handled by service
    }
  }, []);

  return {
    user,
    loading,
    signIn,
    signOut: handleSignOut,
  };
}
