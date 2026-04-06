import {
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User as FirebaseUser,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../../../shared/config/firebase";

const googleProvider = new GoogleAuthProvider();

/**
 * Detect if we're running inside a Tauri webview (production build).
 * In dev mode (localhost), popups work fine. In production Tauri builds,
 * the webview uses tauri://localhost which blocks popups, so we fall back
 * to redirect-based auth.
 */
function isTauriProduction(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.location.protocol === "https:" &&
      window.location.hostname === "tauri.localhost"
    );
  } catch {
    return false;
  }
}

export async function signInWithGoogle(): Promise<FirebaseUser> {
  try {
    if (isTauriProduction()) {
      // In Tauri production, use redirect (popup is blocked by the webview)
      await signInWithRedirect(auth, googleProvider);
      // This line won't be reached — the page redirects to Google.
      // After redirect back, getRedirectResult picks up the result.
      throw new Error("Redirecting...");
    } else {
      // In dev mode (localhost), popup works fine
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    }
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
}

/**
 * Call this on app startup to catch the result of a redirect sign-in.
 * After Google redirects back to the app, this resolves the credential.
 */
export async function handleRedirectResult(): Promise<FirebaseUser | null> {
  try {
    const result = await getRedirectResult(auth);
    return result?.user ?? null;
  } catch (error) {
    console.error("Error handling redirect result", error);
    return null;
  }
}

export function signOut(): Promise<void> {
  return firebaseSignOut(auth).catch((error) => {
    console.error("Error signing out", error);
    throw error;
  });
}

export function onAuthStateChanged(
  callback: (user: FirebaseUser | null) => void
): () => void {
  return firebaseOnAuthStateChanged(auth, callback);
}
