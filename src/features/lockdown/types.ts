// ─── Lockdown Mode Types ─────────────────────────────────────────
// Behavior: inactive → active (monitoring) → blocked app detected → overlay intercept

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

export const GAMING_BLOCKLIST = [
  "steam.exe", "epicgameslauncher.exe", "riotclientux.exe", "battlenet.exe", "upc.exe", "origin.exe", "ealocalhostsvc.exe", "goggalaxy.exe", "xboxapp.exe", "valorant.exe", "valorant-win64-shipping.exe", "leagueclient.exe", "league of legends.exe", "cs2.exe", "csgo.exe", "dota2.exe", "overwatch.exe", "r5apex.exe", "robloxplayerbeta.exe", "minecraft.exe", "javaw.exe", "fortniteclient-win64-shipping.exe", "cod.exe", "gta5.exe", "rainbowsix.exe"
];

export const SOCIAL_BLOCKLIST = [
  "discord.exe", "whatsapp.exe", "telegram.exe", "signal.exe", "viber.exe", "skype.exe", "line.exe", "messenger.exe", "teams.exe", "slack.exe"
];

export const ENTERTAINMENT_BLOCKLIST = [
  "spotify.exe", "netflix.exe", "itunes.exe", "amazon music.exe", "stremio.exe", "vlc.exe", "mpc-hc.exe", "kodi.exe", "popcorntime.exe", "hulu.exe", "disneyplus.exe"
];

export const BROWSING_KEYWORDS = [
  "YouTube", "Twitch", "Reddit", "Twitter", "Instagram", "Facebook", "TikTok", "Pinterest", "Tumblr", "Netflix", "Hulu", "Prime Video", "Crunchyroll", "9gag", "4chan", "Kick", "Rumble"
];

export const LOCKDOWN_PRESETS: BlocklistPreset[] = [
  {
    id: "gaming",
    label: "GAMING",
    icon: "Gamepad2",
    items: GAMING_BLOCKLIST,
  },
  {
    id: "social",
    label: "SOCIAL",
    icon: "MessageCircle",
    items: SOCIAL_BLOCKLIST,
  },
  {
    id: "entertainment",
    label: "ENTERTAINMENT",
    icon: "Tv",
    items: ENTERTAINMENT_BLOCKLIST,
  },
  {
    id: "browsing",
    label: "BROWSING",
    icon: "Globe",
    items: BROWSING_KEYWORDS,
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
