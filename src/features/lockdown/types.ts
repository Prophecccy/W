// ─── Lockdown Mode Types ─────────────────────────────────────────
// State machine: inactive → active (monitoring) → violation detected → strike issued

export interface LockdownState {
  active: boolean;
  startedAt: number | null;       // Date.now() when activated
  duration: number | null;        // Duration in minutes (null = until manually stopped)
  blocklist: string[];            // Window title substrings to block
  violations: LockdownViolation[];
  totalSessions: number;
  totalViolations: number;
}

export interface LockdownViolation {
  appName: string;
  matchedRule: string;
  timestamp: number;
  date: string;         // YYYY-MM-DD
  strikeIssued: boolean;
}

export interface LockdownDurationOption {
  label: string;
  value: number | null; // minutes, null = "Until I stop"
}

export const LOCKDOWN_DURATIONS: LockdownDurationOption[] = [
  { label: "UNTIL I STOP", value: null },
  { label: "30 MINUTES", value: 30 },
  { label: "1 HOUR", value: 60 },
  { label: "2 HOURS", value: 120 },
  { label: "4 HOURS", value: 240 },
  { label: "8 HOURS", value: 480 },
];

// ─── Preset Categories ──────────────────────────────────────────
// Users can toggle entire categories or add custom entries

export interface BlocklistPreset {
  id: string;
  label: string;
  icon: string; // Lucide icon name
  items: string[];
}

export const LOCKDOWN_PRESETS: BlocklistPreset[] = [
  {
    id: "gaming",
    label: "GAMING",
    icon: "Gamepad2",
    items: [
      "Steam", "Epic Games", "Riot Client", "Valorant", "Fortnite",
      "Minecraft", "Roblox", "League of Legends", "Counter-Strike",
      "Overwatch", "Apex Legends", "GeForce NOW", "Xbox", "Battle.net",
      "GOG Galaxy", "EA App", "Ubisoft Connect", "Genshin Impact",
      "Dota 2", "Call of Duty", "Rocket League", "PUBG",
    ],
  },
  {
    id: "social",
    label: "SOCIAL",
    icon: "MessageCircle",
    items: [
      "Discord", "Telegram", "WhatsApp", "Messenger", "Slack",
      "Teams Chat", "Snapchat", "Signal",
    ],
  },
  {
    id: "entertainment",
    label: "ENTERTAINMENT",
    icon: "Tv",
    items: [
      "Netflix", "YouTube", "Twitch", "Spotify", "Prime Video",
      "Disney+", "Crunchyroll", "VLC media player", "Plex",
      "HBO Max", "Hulu", "Apple TV",
    ],
  },
  {
    id: "browsing",
    label: "BROWSING",
    icon: "Globe",
    items: [
      "Reddit", "Twitter", "Instagram", "TikTok", "Facebook",
      "Pinterest", "Tumblr",
    ],
  },
];

export const DEFAULT_LOCKDOWN_STATE: LockdownState = {
  active: false,
  startedAt: null,
  duration: null,
  blocklist: [],
  violations: [],
  totalSessions: 0,
  totalViolations: 0,
};
