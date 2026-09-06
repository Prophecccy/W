export interface ManualSection {
  id: string;
  title: string;
  tag?: string;
  content: string[];
  callouts?: {
    type: 'info' | 'tip' | 'warning' | 'rule';
    title: string;
    text: string;
  }[];
  subsections?: {
    title: string;
    description: string;
    bulletPoints?: string[];
  }[];
}

export interface ManualChapter {
  id: string;
  number: string;
  title: string;
  shortTitle: string;
  iconName: string;
  summary: string;
  keywords: string[];
  sections: ManualSection[];
}

export const MANUAL_CHAPTERS: ManualChapter[] = [
  {
    id: "system-basics",
    number: "01",
    title: "System Overview & The W Philosophy",
    shortTitle: "Overview & Philosophy",
    iconName: "Terminal",
    summary: "Understand the core design philosophy of W, the viewport-locked interface, and how the 24-hour command loop works.",
    keywords: ["overview", "philosophy", "command center", "interface", "viewport", "basics", "endfield", "loop"],
    sections: [
      {
        id: "what-is-w",
        title: "What is W?",
        tag: "CORE PHILOSOPHY",
        content: [
          "W is a military-grade, tactical Command Center built for radical personal accountability. Traditional productivity apps are passive to-do lists that quietly let you procrastinate without consequence. W is fundamentally different: it treats your day as an active operational deployment.",
          "Every day, your scheduled habits, incremental projects, and waking hours are synchronized into a unified visual matrix. If you complete your protocols, your streaks climb and your cognitive momentum grows. If you neglect them, the system penalizes you with strikes that can lock down your interface until penance is completed.",
        ],
        callouts: [
          {
            type: "info",
            title: "THE THREE COMMANDMENTS OF W",
            text: "1. No hidden menus: Every active habit and todo is visible at a glance.\n2. No free passes: What is scheduled must be executed or accounted for.\n3. Biological realism: Your day is anchored to your actual circadian energy, not an abstract clock."
          }
        ]
      },
      {
        id: "viewport-locking",
        title: "The Viewport-Locked Interface",
        tag: "INTERFACE MECHANICS",
        content: [
          "One of the first things you will notice is that W never lets you scroll endlessly down a page. The entire Command Center is strictly locked to 100% of your screen height (100vh).",
          "This intentional constraint forces visual priority: only current, high-leverage protocols are displayed. When a section contains multiple items (like your habit feed), internal scroll containers activate with invisible scrollbars to preserve the clean, distraction-free aesthetic."
        ],
        subsections: [
          {
            title: "Ghost Elevation Aesthetic",
            description: "Elements rest as semi-transparent frosted data projections against your wallpaper. When you hover or interact, elements elevate with sharp outlines and vibrant accent glows."
          },
          {
            title: "Endfield Monospace Typography",
            description: "All labels, timestamps, and metrics are rendered in Departure Mono. Section titles always follow bracketed uppercase notation: [ SYSTEM STATUS ], [ ACTIVE PROTOCOLS ], [ QUICK STATS ]."
          }
        ]
      }
    ]
  },
  {
    id: "habits-matrix",
    number: "02",
    title: "Habits Matrix & Protocol Types",
    shortTitle: "Habits Matrix",
    iconName: "Target",
    summary: "Detailed guide to Boolean habits, Metric targets, Limiter caps, Weekly intervals, hold-to-complete actions, and group management.",
    keywords: ["habits", "protocols", "metric", "limiter", "interval", "weekly", "groups", "undo", "heatmap", "analytics"],
    sections: [
      {
        id: "habit-types",
        title: "The 4 Protocol Archetypes",
        tag: "FOUNDATIONS",
        content: [
          "Not all habits are simple yes/no checkmarks. W provides four distinct behavioral engines designed to match real human habits:"
        ],
        subsections: [
          {
            title: "1. Regular (Boolean) Habits",
            description: "Simple completion actions (e.g. 'Cold Shower', 'Morning Meditation', 'Make Bed'). Once completed for the day, it is stamped and increments your current streak."
          },
          {
            title: "2. Metric Habits (Cumulative Targets)",
            description: "Quantitative goals requiring a specific numeric threshold (e.g. '50 Pushups', '20 Pages Reading', '3000ml Water'). You can log progress in increments throughout the day (+5, +10). A progress bar visualizes your proximity to the target.",
            bulletPoints: [
              "Partial progress is saved in real-time.",
              "Hitting or exceeding the target marks the protocol complete.",
              "Can be configured as a daily goal or a multi-day/weekly aggregate."
            ]
          },
          {
            title: "3. Limiter Habits (Negative Habit Caps)",
            description: "Protective guards against vices or time-wasters (e.g. 'Max 1 Soda', 'Max 30m Gaming', 'Max 2 Coffees'). Unlike regular habits, limiters start satisfied and turn red as you log instances.",
            bulletPoints: [
              "Staying under the limit keeps the protocol safe.",
              "Exceeding the threshold highlights the card in glowing crimson and incurs a strike warning.",
              "Allows honest tracking of reduction goals rather than unrealistic cold-turkey stops."
            ]
          },
          {
            title: "4. Multi-Day & Weekly Interval Habits",
            description: "Protocols that do not require daily repetition but need consistency over a window (e.g. 'Gym 3x per week', 'Combat Training 4x per week').",
            bulletPoints: [
              "Every single workout or unit logged immediately stamps an active green cell on your activity heatmap.",
              "A sub-badge displays '✓ DONE TODAY' when you've worked on it today, even before the weekly quota is fully met.",
              "Progress resets cleanly on your configured Weekly Reset Day (default: Monday)."
            ]
          }
        ]
      },
      {
        id: "habit-interactions",
        title: "Hold-to-Complete & Undo Grace Period",
        tag: "INTERACTIONS",
        content: [
          "To prevent accidental misclicks, W uses tactical interaction mechanics:"
        ],
        callouts: [
          {
            type: "tip",
            title: "HOLD-TO-COMPLETE SWEEP",
            text: "Press and hold any habit card for 500ms. A sleek horizontal energy fill sweeps across the card, accompanied by a subtle completion tone. Releasing early cancels the action."
          },
          {
            type: "rule",
            title: "8-SECOND UNDO GRACE PERIOD",
            text: "Immediately after completing a habit, a glowing countdown line activates across the bottom of the card for 8 seconds. Clicking the card during this window instantly reverses the completion and restores your previous metric value."
          }
        ]
      },
      {
        id: "habit-groups",
        title: "Habit Groups & Reassignment",
        tag: "ORGANIZATION",
        content: [
          "You can organize habits into custom categories (such as [ MORNING ], [ DEEP WORK ], [ FITNESS ], or [ EVENING ]).",
          "Habit groups can be modified anytime after creation. Simply click into any habit from the Habits page to open its [ CONFIGURATION ] panel. Use the Group dropdown to switch to another group, choose [ UNGROUPED ], or type a brand new group name on-the-fly. Changes persist immediately to local storage and sync with Google Drive."
        ]
      },
      {
        id: "habit-analytics",
        title: "Deep Dive Analytics & Activity Heatmap",
        tag: "ANALYTICS",
        content: [
          "Clicking any habit opens its complete analytical breakdown:",
          "• GitHub-Style Calendar Heatmap: Visualizes your consistency over the past 365 days. Darker green blocks represent higher completion intensity or milestone achievements.",
          "• Peak Performance Window: Analyzes the exact timestamps of your completions to identify when during the day (Morning, Afternoon, Evening, Night) you are most disciplined.",
          "• Best vs Current Streak: Compares your active consecutive run against your historical all-time record.",
          "• Weekly Adherence Rate: Accurately evaluates completion percentage against your target."
        ]
      }
    ]
  },
  {
    id: "daily-cycle",
    number: "03",
    title: "Daily Cycle & Reset Timing",
    shortTitle: "Daily Reset & Time",
    iconName: "Clock",
    summary: "How daily deadlines work, why the reset defaults to 04:00 AM, how timezone shifts operate, and what the Gap Processor does when you miss days.",
    keywords: ["daily reset", "reset time", "midnight", "gap processor", "time", "timezone", "auto-freeze", "cycle"],
    sections: [
      {
        id: "daily-reset-time",
        title: "The 04:00 AM Daily Reset Boundary",
        tag: "TIME ENGINE",
        content: [
          "Most apps blindly reset at midnight (00:00). If you are awake working or studying at 12:30 AM, an app resetting at midnight unfairly breaks your streak for yesterday and demands you finish today's tasks prematurely.",
          "W defaults your Daily Reset Time to 04:00 AM. Any work completed between midnight and 03:59 AM counts toward yesterday's protocols. When the clock hits 04:00 AM, yesterday's cycle is sealed, unfulfilled scheduled habits receive strikes, and a fresh operational day begins.",
          "You can customize your reset hour in [ SETTINGS ] → [ SCHEDULE & TIME ] to any hour that matches your lifestyle (e.g. 02:00 AM, 05:00 AM, or midnight)."
        ]
      },
      {
        id: "gap-processor",
        title: "The Gap Processor (Offline Catch-Up)",
        tag: "CATCH-UP LOGIC",
        content: [
          "What happens if you turn off your computer for several days? When W launches, the Gap Processor automatically analyzes the timeline between your last active session and today:"
        ],
        subsections: [
          {
            title: "Day-by-Day Historical Audit",
            description: "The engine iterates through every skipped day sequentially, checking which habits were scheduled for those specific days of the week."
          },
          {
            title: "Auto-Freeze Safeguard (Vacation Protection)",
            description: "If the engine detects you have been offline for 2 or more consecutive days, it triggers the Auto-Freeze protocol. Instead of bankrupting your account with dozens of strikes, it freezes the app retroactive to your last active date, preserving your streaks until you return."
          },
          {
            title: "Welcome Back De-Brief",
            description: "Upon launching after an auto-freeze, a Welcome Back dialog appears, showing how many days were frozen and allowing you to thaw the system when you are ready to resume."
          }
        ]
      }
    ]
  },
  {
    id: "strikes-lockout",
    number: "04",
    title: "Strikes & Lockout Discipline System",
    shortTitle: "Strikes & Lockout",
    iconName: "AlertTriangle",
    summary: "Understand the strike penalties (0 to 5), the full viewport lockout, widget cyber shield, multi-screen window dragging, and penance options.",
    keywords: ["strikes", "lockout", "penance", "punishment", "discipline", "frozen", "difficulty", "drag", "multi-screen"],
    sections: [
      {
        id: "strike-ladder",
        title: "The 5-Strike Escalation Ladder",
        tag: "ENFORCEMENT",
        content: [
          "Strikes are tangible consequences for failing your commitments. When the daily reset threshold passes, any incomplete scheduled habit adds +1 strike to your account."
        ],
        subsections: [
          {
            title: "Strikes 0 — 2: Clean Status",
            description: "Normal operations. The strike counter in the sidebar remains subtle and green."
          },
          {
            title: "Strike 3: Warning Phase",
            description: "The strike indicator turns amber. An alert toast reminds you that you are two failures away from system lockout."
          },
          {
            title: "Strike 4: Critical Threat",
            description: "The strike indicator pulses bright crimson. One more slip will trigger immediate system shutdown."
          },
          {
            title: "Strike 5: SYSTEM LOCKDOWN",
            description: "The viewport freezes completely. A high-contrast cyber lockout overlay envelops your application. All normal habit logging and todo navigation are blocked."
          }
        ]
      },
      {
        id: "lockout-mechanics",
        title: "Lockout Behavior & Multi-Screen Window Dragging",
        tag: "LOCKOUT BEHAVIOR",
        content: [
          "When lockout occurs, W enforces discipline across your entire workspace:"
        ],
        subsections: [
          {
            title: "Desktop Widget Cyber Shield",
            description: "The desktop widget immediately covers all underlying cards with an opaque, frosted dark-red cyber shield (rgba(14, 4, 4, 0.96) with 16px blur) and a pulsing warning ring. Underlying protocols and the '+ TODO' button are completely sealed."
          },
          {
            title: "Multi-Screen Window Dragging",
            description: "Even when in lockout, you retain complete physical control of your windows. Clicking and dragging anywhere on the locked Command Center or the widget's cyber shield allows you to smoothly move the windows across monitors to keep your desktop organized."
          }
        ],
        callouts: [
          {
            type: "rule",
            title: "ZERO-BYPASS ARCHITECTURE",
            text: "You cannot bypass lockout by refreshing, closing windows, or hitting cancel on compensation dialogs. Forms are embedded inline, and shortcuts are disabled until penance is completed."
          }
        ]
      },
      {
        id: "resolving-lockout",
        title: "Resolving Lockout (Penance & Escalation)",
        tag: "RESOLUTION",
        content: [
          "To unlock your Command Center, click [ RESOLVE LOCKOUT ]. You must choose between two paths:"
        ],
        subsections: [
          {
            title: "Option A: Immediate Penance Action",
            description: "Create and immediately execute an extra compensatory protocol (a rigorous new habit or an immediate high-priority task) to earn redemption."
          },
          {
            title: "Option B: Permanent Difficulty Escalation",
            description: "Accept permanent increases in accountability for your active protocols:",
            bulletPoints: [
              "Metric Habits: Target values increase by +33% (minimum +1). For example, 30 pushups becomes 40 pushups.",
              "Limiter Habits: Daily allowances tighten by -33% (minimum -1). For example, 3 coffees becomes 2 coffees.",
              "Upon accepting the higher difficulty, all 5 strikes are cleared, and the system reactively unlocks."
            ]
          }
        ]
      },
      {
        id: "toggling-strike-system",
        title: "Discipline Modes: Enabling & Disabling Strikes",
        tag: "CUSTOMIZATION",
        content: [
          "W is designed to adapt to your current life phase. While the default mode enforces military-grade discipline with 5 strikes and full lockout penance, you can turn the entire strike system off at any time without losing any habit data or streaks."
        ],
        subsections: [
          {
            title: "Where to Toggle",
            description: "Navigate to [ SETTINGS ] → [ SCHEDULE & TIME ] → [ DISCIPLINE & ACCOUNTABILITY ] and toggle 'Strike System Discipline'."
          },
          {
            title: "Tactical Discipline Mode (Enabled — Default)",
            description: "Uncompleted scheduled habits at daily reset or exceeded limiter thresholds accrue strikes (0–5). Reaching 5 strikes locks the entire viewport and requires penance to restore operations."
          },
          {
            title: "Zen Habit Tracker Mode (Disabled)",
            description: "No strikes are ever awarded for missed habits or overdue tasks, no lockouts occur, and the strike indicator in the bottom-left sidebar and desktop widget completely disappears. The app functions seamlessly as an aesthetically refined, pressure-free habit and task tracker."
          },
          {
            title: "Zero Data Loss / Reversible at Any Time",
            description: "Disabling strikes never deletes your historical logs or records. If you re-enable the strike system later, your previous counts and discipline ladder resume immediately right where you left off."
          }
        ],
        callouts: [
          {
            type: "tip",
            title: "INSTANT UNLOCK VIA SETTINGS",
            text: "If you find yourself locked out under emergency circumstances, toggling 'Strike System Discipline' OFF in Settings immediately unlocks your Command Center without requiring penance."
          }
        ]
      }
    ]
  },
  {
    id: "sleeptube-gauge",
    number: "05",
    title: "SleepTube: Waking Fuel Gauge",
    shortTitle: "SleepTube Fuel Gauge",
    iconName: "BatteryCharging",
    summary: "How the SleepTube calculates your remaining biological waking energy, circadian milestones, and depletion alerts.",
    keywords: ["sleeptube", "fuel", "energy", "circadian", "sleep", "wake", "bedtime", "gauge"],
    sections: [
      {
        id: "sleeptube-concept",
        title: "The Philosophy of Waking Fuel",
        tag: "CIRCADIAN RHYTHM",
        content: [
          "Time is not linear — your energy decays throughout your waking hours. Traditional clocks tell you what time it is, but they don't tell you how much productive life you have left in today's cycle.",
          "The SleepTube is a vertical, luminescent mercury gauge anchored to the left of your Command Center and Desktop Widget. It visualizes your biological waking energy as a depleting fuel tank, counting down from your target Wake-Up Time to your target Bedtime."
        ]
      },
      {
        id: "depletion-zones",
        title: "The 4 Depletion Zones",
        tag: "FUEL STATUS",
        content: [
          "Throughout the day, the tube changes color and behavior across 4 discrete psychological stages:"
        ],
        subsections: [
          {
            title: "1. Optimal Fuel (100% — 70%) — Cyan/Accent Glow",
            description: "Peak cognitive state. Best reserved for high-friction deep work, workout protocols, and creative problem-solving."
          },
          {
            title: "2. Cruising Fuel (69% — 30%) — Cool Blue",
            description: "Steady-state afternoon momentum. Ideal for tactical execution, meetings, and incremental todos."
          },
          {
            title: "3. Low Fuel (29% — 10%) — Amber Warning",
            description: "Evening decline. The gauge shifts to amber, signaling that you should begin wrapping up high-demand tasks and reviewing outstanding daily protocols."
          },
          {
            title: "4. Fuel Depleted (< 10%) — Crimson Flash",
            description: "Circadian limit reached. The gauge flashes red with the label [ DEPLETED ]. The system encourages you to disconnect, log your final Daily Note, and sleep."
          }
        ],
        callouts: [
          {
            type: "tip",
            title: "CONFIGURING YOUR CIRCADIAN HOURS",
            text: "Head to [ SETTINGS ] → [ SLEEP TUBE ] to set your typical Wake-Up Time (e.g. 07:00) and Bedtime (e.g. 23:30). The tube automatically calculates the total waking window and scales smoothly in real time."
          }
        ]
      }
    ]
  },
  {
    id: "todos-architecture",
    number: "06",
    title: "Todos Matrix & Tactical Tasks",
    shortTitle: "Todos Architecture",
    iconName: "CheckSquare",
    summary: "Master normal todos, numbered multi-step incremental tasks, priority tiers (P1-P4), and the floating quick todo creator.",
    keywords: ["todos", "tasks", "numbered", "incremental", "priority", "p1", "quick todo", "todo-creator"],
    sections: [
      {
        id: "todo-types",
        title: "Standard vs Numbered (Incremental) Todos",
        tag: "TASK ENGINES",
        content: [
          "W divides tasks into two structural types depending on whether an action is atomic or progressive:"
        ],
        subsections: [
          {
            title: "Standard Checkbox Todos",
            description: "Atomic tasks that are either pending or completed (e.g. 'Submit tax return', 'Call accountant'). One click marks them done."
          },
          {
            title: "Numbered (Incremental) Todos",
            description: "Multi-part tasks that require counting steps or units (e.g. 'Read Chapters 1 to 12', 'Review 5 PRs', 'Write 4 essay pages').",
            bulletPoints: [
              "Set a target number of units (e.g. 10).",
              "Each click increments the counter (+1) with immediate visual feedback.",
              "Reaching the final count automatically marks the todo complete."
            ]
          }
        ]
      },
      {
        id: "priority-tiers",
        title: "Priority Hierarchy (P1 to P4)",
        tag: "PRIORITIZATION",
        content: [
          "Every todo can be assigned a military-style priority tier:",
          "• [ P1 CRITICAL ] (Crimson): Non-negotiable priorities for today. If not done, your day was a failure.",
          "• [ P2 HIGH ] (Amber): Important strategic initiatives that move the needle.",
          "• [ P3 MEDIUM ] (Blue/Accent): Routine daily operations and tasks.",
          "• [ P4 LOW ] (Muted Gray): Nice-to-have backlog items or casual ideas."
        ]
      },
      {
        id: "quick-todo-creator",
        title: "Floating Quick Todo Window (Ctrl+N)",
        tag: "FAST CAPTURE",
        content: [
          "You never need to interrupt your focus or switch app windows to capture a fleeting thought or sudden assignment.",
          "Press Ctrl+N (or click the '[ + TODO ]' button on the Desktop Widget) from anywhere on your PC. A lightweight, floating, centered quick-creator dialog spawns instantly. Type your task, select priority, hit Enter, and the task immediately syncs to your database while the window auto-closes."
        ]
      }
    ]
  },
  {
    id: "desktop-widget",
    number: "07",
    title: "Desktop Widget Companion",
    shortTitle: "Desktop Widget",
    iconName: "Monitor",
    summary: "How the desktop companion widget works, bottom pinning, auto-scaling height, safe-centering habits, and quick logging.",
    keywords: ["widget", "desktop", "hud", "always on top", "bottom pinned", "auto resize", "safe center"],
    sections: [
      {
        id: "widget-overview",
        title: "Always-On-Screen Tactical HUD",
        tag: "DESKTOP COMPANION",
        content: [
          "The Desktop Widget is an ultra-minimalist, floating holographic HUD that sits directly on your desktop or secondary monitor. It gives you 100% visibility over your daily habits without needing the full Command Center open.",
          "Features include:",
          "• Live Digital Clock: Large, high-contrast tabular clock display.",
          "• Integrated Mini SleepTube: Displays your waking fuel level right beside your habits.",
          "• Quick Protocol Hold: Complete habits directly from your desktop with the hold-sweep gesture.",
          "• Dynamic Auto-Resize: The widget window automatically measures the exact height of your active habits and smoothly resizes itself so there is never awkward empty space or unnecessary bulk."
        ]
      },
      {
        id: "safe-center-scroll",
        title: "Safe Centering & Zero Cutoff Technology",
        tag: "POLISH & LAYOUT",
        content: [
          "Whether you have 1 habit or 15 habits, the widget renders them cleanly:",
          "• Few Habits (1–3): Habits are vertically centered inside the widget, maintaining the minimalist Ghost Elevation aesthetic.",
          "• Many Habits (8+): The layout automatically switches to top alignment ('safe center') and activates internal scrolling with custom edge padding, ensuring habits are never clipped at the top header or bottom stats deck."
        ],
        callouts: [
          {
            type: "tip",
            title: "DRAGGING & POSITIONING",
            text: "Click and drag any non-interactive surface of the widget to place it anywhere across multiple monitors. W automatically remembers its coordinates across app reboots."
          }
        ]
      }
    ]
  },
  {
    id: "logbook-gdrive",
    number: "08",
    title: "Logbook & Google Drive Cloud Sync",
    shortTitle: "Logbook & Google Drive",
    iconName: "BookOpen",
    summary: "Write daily markdown logs, connect your personal Google Drive with PKCE security, and understand the background synchronization engine.",
    keywords: ["logbook", "notes", "markdown", "google drive", "cloud sync", "pkce", "oauth", "backup"],
    sections: [
      {
        id: "daily-notes",
        title: "The Tactical Daily Log",
        tag: "JOURNALING",
        content: [
          "Every high-performer needs an after-action review. The Logbook provides a fast, keyboard-friendly markdown editor tied directly to the current calendar date.",
          "Write notes, document wins, record lessons, or draft plans. Your notes are saved locally to IndexedDB in real-time as you type, meaning zero latency and zero reliance on an active internet connection."
        ]
      },
      {
        id: "google-drive-sync",
        title: "Direct Google Drive Cloud Sync (Zero Middleman)",
        tag: "PRIVACY & SECURITY",
        content: [
          "W does not store your private notes on third-party servers. Instead, it connects directly from your desktop app to your personal Google Drive account using Google's official OAuth 2.0 PKCE (Proof Key for Code Exchange) flow."
        ],
        subsections: [
          {
            title: "Folder Hierarchy",
            description: "Notes are saved into a clean folder in your Google Drive root: W_Logbook / [Year] / [YYYY-MM-DD].md."
          },
          {
            title: "Background Sync Heartbeat",
            description: "The sync engine runs in the background every 5 minutes and eagerly triggers 15 seconds after you stop typing. It automatically handles token refreshes, resolves duplicate folders, and aligns timestamps to prevent sync conflicts."
          },
          {
            title: "Historical Archive Browser",
            description: "Browse past notes by clicking any date on the Logbook calendar. You can read, search, and edit past entries seamlessly."
          }
        ]
      }
    ]
  },
  {
    id: "lockdown-engine",
    number: "09",
    title: "Lockdown Focus Engine",
    shortTitle: "Lockdown Engine",
    iconName: "Shield",
    summary: "Block distracting apps and websites, trigger high-discipline study/work sprints, and understand process termination rules.",
    keywords: ["lockdown", "focus", "blocker", "distractions", "processes", "blacklist", "sprint"],
    sections: [
      {
        id: "lockdown-concept",
        title: "Distraction Elimination",
        tag: "FOCUS SESSIONS",
        content: [
          "When you need to enter deep work, willpower is not enough. The Lockdown engine enforces total environment hygiene by blocking distracting desktop software and websites during designated focus blocks."
        ],
        subsections: [
          {
            title: "Application Blacklists",
            description: "Configure process names (e.g. Steam, Discord, Spotify, games, or social media desktop clients) in [ SETTINGS ] → [ LOCKDOWN ]. When Lockdown is active, attempting to launch these apps will terminate their windows or display an enforcement overlay."
          },
          {
            title: "Timed Sprints",
            description: "Start a 25-minute, 50-minute, or custom focus session. The sidebar highlights with an active [ LOCKDOWN ] badge, and the countdown timer anchors your current sprint."
          }
        ]
      }
    ]
  },
  {
    id: "shortcuts-pro-tips",
    number: "10",
    title: "Keyboard Shortcuts & Pro Tips",
    shortTitle: "Shortcuts & Pro Tips",
    iconName: "Keyboard",
    summary: "Quick-reference cheat sheet for global hotkeys, command palette actions, wallpaper customization, and low graphics mode.",
    keywords: ["shortcuts", "hotkeys", "ctrl+k", "ctrl+n", "wallpaper", "aesthetics", "backup", "tips", "tricks"],
    sections: [
      {
        id: "keyboard-shortcuts",
        title: "Global Keyboard Shortcuts Cheat Sheet",
        tag: "HOTKEYS",
        content: [
          "Control W at terminal speed with built-in hotkeys:"
        ],
        subsections: [
          {
            title: "Ctrl + K — Command Palette",
            description: "Open the universal search bar to quickly jump between pages, toggle features, or complete habits instantly by name."
          },
          {
            title: "Ctrl + N — Quick Todo Creator",
            description: "Spawn the floating quick todo creator from any window or screen."
          },
          {
            title: "Ctrl + / — Field Manual",
            description: "Instantly jump to this documentation manual to look up any feature or rule."
          },
          {
            title: "Escape — Dismiss Overlays",
            description: "Close modals, cancel active search, or dismiss detail drawers."
          }
        ]
      },
      {
        id: "aesthetics-customization",
        title: "Wallpapers & Custom Visual Aesthetics",
        tag: "AESTHETICS",
        content: [
          "Customize W to match your battlestation setup in [ SETTINGS ] → [ APPEARANCE ]:",
          "• Custom Accent Colors: Choose from Cyber Cyan (#5B8DEF), Neon Emerald (#4ADE80), Crimson Red (#E8736C), Amber Orange, or Deep Purple.",
          "• Custom Wallpapers: Upload any local JPG or PNG image to serve as the backdrop for both the main Command Center and Desktop Widget.",
          "• Dim & Blur Sliders: Adjust background dimming (0% to 100%) and frosted glass blur (0px to 32px) to ensure text remains 100% readable over any wallpaper.",
          "• Low Graphics Mode: Disables heavy backdrop blurs for lightning-fast performance on older or battery-conscious laptops."
        ]
      },
      {
        id: "data-backups",
        title: "Data Sovereignty & Local JSON Backups",
        tag: "DATA MANAGEMENT",
        content: [
          "Your data belongs to you. In [ SETTINGS ] → [ DATA & SYSTEM ], you can click [ EXPORT DATA ] to download a complete JSON backup of all habits, logs, streaks, and settings at any time.",
          "To restore or migrate to a new machine, simply click [ IMPORT DATA ] and select your backup file."
        ]
      }
    ]
  }
];
