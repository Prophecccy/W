// ─── Lockdown Mode Types ─────────────────────────────────────────
// Behavior: inactive → active (monitoring) → blocked app detected → overlay intercept

export interface LockdownSchedule {
  id: string;
  name: string;
  enabled: boolean;
  startTime: string; // "HH:MM" in 24h format
  endTime: string;   // "HH:MM" in 24h format
  days: number[];    // [0..6] (0 = Sunday, 1 = Monday, etc.)
  blocklist: string[];
}

export interface LockdownState {
  active: boolean;
  startedAt: number | null;       // Date.now() when activated
  duration: number | null;        // Duration in minutes (null = until manually stopped)
  blocklist: string[];            // Window title substrings to block
  violations: LockdownViolation[];
  totalSessions: number;
  totalViolations: number;
  remainingSeconds?: number | null; // Monotonic countdown track
  schedules?: LockdownSchedule[];  // Scheduled lockdowns
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

// ─── Blocklist Data (2026-current) ───────────────────────────────
// .exe entries  → exact match on foreground process executable name
// plain strings → substring match on foreground window title

export const GAMING_BLOCKLIST = [
  // Launchers & clients
  "steam.exe", "steamwebhelper.exe",
  "epicgameslauncher.exe",
  "riotclientux.exe", "riotclientservices.exe",
  "battlenet.exe",
  "ubisoftconnect.exe",
  "eadesktop.exe", "eabackgroundservice.exe",
  "goggalaxy.exe",
  "xboxapp.exe", "gamingservices.exe",
  // Popular titles
  "valorant.exe", "valorant-win64-shipping.exe",
  "leagueclient.exe", "league of legends.exe",
  "cs2.exe",
  "dota2.exe",
  "overwatch.exe",
  "r5apex.exe",
  "robloxplayerbeta.exe", "robloxstudio.exe",
  "minecraft.exe", "javaw.exe",
  "fortniteclient-win64-shipping.exe",
  "cod.exe",
  "gta5.exe",
  "rainbowsix.exe",
  "eldenring.exe",
  "helldivers2.exe",
  "genshinimpact.exe",
  "starrailbase.exe",
  "cyberpunk2077.exe",
  "palworld-win64-shipping.exe",
  "deadlock.exe",
  "marvelrivals.exe",
];

export const SOCIAL_BLOCKLIST = [
  "discord.exe",
  "whatsapp.exe",
  "telegram.exe",
  "signal.exe",
  "viber.exe",
  "skype.exe",
  "line.exe",
  "messenger.exe",
  "ms-teams.exe", "teams.exe",
  "slack.exe",
  "wechat.exe",
  "zoom.exe",
  "guilded.exe",
  "element.exe",
];

export const ENTERTAINMENT_BLOCKLIST = [
  "spotify.exe",
  "netflix.exe",
  "applemusic.exe",
  "appletv.exe",
  "amazon music.exe",
  "stremio.exe",
  "vlc.exe",
  "mpc-hc.exe",
  "kodi.exe",
  "plex.exe", "plexmediaplayer.exe",
  "youtube music.exe",
  "tidal.exe",
  "deezer.exe",
  "amazonprimevideo.exe",
];

export const BROWSING_KEYWORDS = [
  // Video & streaming
  "YouTube", "Twitch", "Kick", "Rumble", "Vimeo", "DailyMotion",
  // Social media (browser tabs)
  "Reddit", "Twitter", "X.com", "Instagram", "Facebook", "TikTok",
  "Threads", "Bluesky", "Pinterest", "Tumblr", "Imgur", "9gag", "4chan",
  // Streaming services
  "Netflix", "Hulu", "Prime Video", "Crunchyroll", "Disney+",
  // Misc time-sinks
  "BuzzFeed", "iFunny",
];

export const SHOPPING_BLOCKLIST = [
  "Amazon.in", "Amazon.com",
  "Flipkart", "Myntra", "Ajio",
  "eBay", "AliExpress", "Etsy",
  "Walmart", "Best Buy", "Target",
  // Trading & crypto
  "Robinhood", "Coinbase", "Binance",
  "TradingView", "Zerodha", "Groww",
];

export const NEWS_BLOCKLIST = [
  "Hacker News", "TechCrunch", "The Verge", "Engadget", "Gizmodo",
  "Ars Technica", "Slashdot",
  "Quora", "Medium", "Substack",
  "Wikipedia", "Fandom",
  "Google News", "Apple News",
  "CNN", "BBC News",
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
  {
    id: "shopping",
    label: "SHOPPING & TRADING",
    icon: "ShoppingBag",
    items: SHOPPING_BLOCKLIST,
  },
  {
    id: "news",
    label: "NEWS & FEEDS",
    icon: "Newspaper",
    items: NEWS_BLOCKLIST,
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
  schedules: [],
};
