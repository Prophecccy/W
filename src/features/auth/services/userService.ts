import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../../shared/config/firebase";
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
  lowGraphicsMode: false,
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
  photoURL: string | null,
  initialSettings?: Partial<Settings>
): Promise<User> {
  const newUser: User = {
    uid,
    email,
    displayName,
    photoURL,
    createdAt: Date.now(),
    lastActiveDate: getToday(),
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
