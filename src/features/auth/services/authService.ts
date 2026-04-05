import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { auth } from "../../../shared/config/firebase";

const googleProvider = new GoogleAuthProvider();

export function signInWithGoogle(): Promise<FirebaseUser> {
  return signInWithPopup(auth, googleProvider)
    .then((result) => result.user)
    .catch((error) => {
      console.error("Error signing in with Google", error);
      throw error;
    });
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
