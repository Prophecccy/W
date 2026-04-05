export interface Settings {
  theme: "light" | "dark" | "system";
  timezone: string; // e.g. "Asia/Kolkata"
  weekStartsOn: number; // 0-6 (0=Sunday)
  dailyResetTime: string; // e.g. "04:00"
  weeklyResetDay: number; // 0-6
  notifications: boolean;
  eveningNudge: boolean;
  strikeWarnings: boolean;
  lockoutAlert: boolean;
  weeklySummary: boolean;
  completionSound: boolean;
  lowGraphicsMode: boolean;
}

export interface Aesthetics {
  widget: { dimIntensity: number; blurIntensity?: number; accentColor: string };
  mobile: { dimIntensity: number; blurIntensity?: number; accentColor: string };
  desktop: { dimIntensity: number; blurIntensity?: number; accentColor: string };
}

export interface Wallpapers {
  widget: string | null;
  mobile: string | null;
  desktop: string | null;
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: number;
  lastActiveDate: string; // "YYYY-MM-DD"
  settings: Settings;
  aesthetics: Aesthetics;
  wallpapers: Wallpapers;
  strikes: {
    current: number; // 0-5 (5 = locked)
    total: number;
    lastStrikeDate: string | null;
    history: any[];
  };
  freeze?: {
    active: boolean;
    startDate: string | null;
    endDate: string | null;
    reason: string | null;
    lastInteractionDate: string;
    history: any[];
  };
}
