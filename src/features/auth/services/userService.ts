import { doc, getDoc, setDoc, updateDoc, collection, getDocs, writeBatch, deleteDoc } from "firebase/firestore";
import { deleteUser } from "firebase/auth";
import { db, auth } from "../../../shared/config/firebase";
import { User, Settings, Aesthetics, Wallpapers } from "../../../shared/types";
import { getToday } from "../../../shared/utils/dateUtils";

const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  weekStartsOn: 1, // Monday default per v2
  dailyResetTime: "04:00", // 4:00 AM default per v2
  weeklyResetDay: 1, // Monday default per v2
  notifications: true,
  eveningNudge: true,
  strikeWarnings: true,
  lockoutAlert: true,
  weeklySummary: true,
  completionSound: true,
  predictiveWarnings: true,
  lowGraphicsMode: false,
  wakeUpTime: "07:00",
  bedTime: "23:00",
  emptyTubeText: "DEPLETED",
};

const DEFAULT_AESTHETICS: Aesthetics = {
  widget: { dimIntensity: 0.6, accentColor: "#5B8DEF" },
  mobile: { dimIntensity: 0.6, accentColor: "#5B8DEF" },
  desktop: { dimIntensity: 0.6, accentColor: "#5B8DEF" },
};

const DEFAULT_WALLPAPERS: Wallpapers = {
  widget: null,
  mobile: null,
  desktop: null,
};

export async function getUserDoc(uid: string): Promise<User | null> {
  const docRef = doc(db, "users", uid);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return snap.data() as User;
  }
  return null;
}

export async function createUserDoc(
  uid: string,
  email: string | null,
  displayName: string | null,
  photoURL: string | null = "",
  initialSettings?: Partial<Settings>
): Promise<User> {
  const newUser: User = {
    uid,
    email,
    displayName,
    photoURL,
    createdAt: Date.now(),
    lastActiveDate: getToday(),
    hasOnboarded: true,
    settings: { ...DEFAULT_SETTINGS, ...initialSettings },
    aesthetics: DEFAULT_AESTHETICS,
    wallpapers: DEFAULT_WALLPAPERS,
    strikes: {
      current: 0,
      total: 0,
      lastStrikeDate: null,
      history: [],
    },
  };

  await setDoc(doc(db, "users", uid), newUser);
  return newUser;
}

export async function updateUserDoc(uid: string, updates: Partial<User>): Promise<void> {
  const docRef = doc(db, "users", uid);
  // @ts-ignore - Firestore update types
  await updateDoc(docRef, updates);
}


/**
 * Wipes all subcollection data for a given user.
 */
export async function wipeUserSubcollections(uid: string): Promise<void> {
  const collectionsToWipe = ["groups", "habits", "logs", "todos", "undoHistory", "sticky-notes"];
  
  for (const col of collectionsToWipe) {
    try {
      const colRef = collection(db, "users", uid, col);
      const snap = await getDocs(colRef);
      
      if (!snap.empty) {
        // Firestore batches support up to 500 operations. If more, we'd chunk,
        // but for a single user's subcollection it's usually fine. 
        // For safety, we chunk into 500:
        const chunks = [];
        for (let i = 0; i < snap.docs.length; i += 500) {
          chunks.push(snap.docs.slice(i, i + 500));
        }

        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
    } catch (err) {
      console.error(`Error wiping collection ${col}:`, err);
    }
  }
}

/**
 * Starts the user from scratch. Keeps auth, but deletes user doc to force onboarding and wipes subcollections.
 */
export async function resetUserData(uid: string): Promise<void> {
  // 1. Wipe data
  await wipeUserSubcollections(uid);

  // 2. Delete user doc (this will force the app into the onboarding phase on reload)
  await deleteDoc(doc(db, "users", uid));
}

/**
 * Fully deletes the user's data and their auth account.
 */
export async function deleteUserAccountAndData(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user found.");

  const uid = user.uid;

  // Pre-flight check: Firebase deleteUser requires a recent login (< 5 mins ago).
  // We force an ID token refresh to verify the session is active/valid, and enforce
  // a strict 3-minute threshold to prevent any clock drift from causing data orphanage.
  await user.getIdToken(true);
  const lastSignInTime = user.metadata.lastSignInTime;
  if (lastSignInTime) {
    const ageMs = Date.now() - new Date(lastSignInTime).getTime();
    if (ageMs > 3 * 60 * 1000) {
      const error = new Error("This operation is sensitive and requires recent authentication. Please log out and log back in, then try again.") as any;
      error.code = "auth/requires-recent-login";
      throw error;
    }
  }

  // 1. Wipe data
  await wipeUserSubcollections(uid);
  
  // 2. Delete user doc
  await deleteDoc(doc(db, "users", uid));

  // 3. Delete auth account
  await deleteUser(user);
}
