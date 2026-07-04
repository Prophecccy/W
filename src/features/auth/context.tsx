import { createContext, useContext, ReactNode } from "react";
import { useAuth } from "./hooks/useAuth";
import { LocalUser as FirebaseUser } from "../../shared/services/localDb";

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  error: string | null;
  signingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  devSkip: () => void;
  isDriveLinked: boolean;
  setIsDriveLinked: (linked: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}


