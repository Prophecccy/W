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
    keywords: ["overview", "philosophy", "command center", "interface", "viewport", "basics", "loop"],
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
          "One of the first things you will notice on the Dashboard is that W never lets you scroll endlessly down a page. The primary Command Center HUD is strictly locked to 100% of your screen height (100vh).",
          "This intentional constraint forces visual priority: only current, high-leverage protocols are displayed. When a section contains multiple items (like your habit feed), internal scroll containers activate with invisible scrollbars to preserve the clean, distraction-free aesthetic. Detailed repository views (Manual, Habits, Analytics, Settings) support smooth vertical scrolling."
        ],
        subsections: [
          {
            title: "Ghost Elevation Aesthetic",
            description: "Elements rest as semi-transparent frosted data projections against your wallpaper. When you hover or interact, elements elevate with sharp outlines and vibrant accent glows."
          },
          {
            title: "Departure Mono Typography",
            description: "All labels, timestamps, and metrics are rendered in Departure Mono, an 8-bit retro tactical monospace font. Section titles always follow bracketed uppercase notation: [ SYSTEM STATUS ], [ ACTIVE PROTOCOLS ], [ QUICK STATS ]."
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
        title: "The 5 Protocol Archetypes",
        tag: "FOUNDATIONS",
        content: [
          "Not all habits are simple yes/no checkmarks. W provides five distinct behavioral engines designed to match real human habits:"
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
          },
          {
            title: "5. Specific Days Habits (Discrete Day Protocols)",
            description: "Protocols that occur only on designated days of the week (e.g. 'Heavy Squats on Monday & Thursday', 'Weekly Review on Sunday').",
            bulletPoints: [
              "Appears in your active habit matrix strictly on its scheduled days of the week.",
              "On non-scheduled days, the habit is cleanly hidden from your active list and displayed under [ UPCOMING ] with a 'NEXT: <DAY>' badge.",
              "Zero Carryover: If you miss a scheduled day, it does not roll over to the next morning—it disappears until the next scheduled day.",
              "Strike Integrity: Missing a scheduled day incurs exactly 1 strike point if the Strike System is active (0 strikes if disabled). Unscheduled rest days never accrue penalties.",
              "Discrete Heatmap & Analytics: Rest days are displayed as subtle non-scheduled cells, preventing unfair dilution of your completion efficiency."
            ]
          }
        ]
      },
      {
        id: "habit-interactions",
        title: "Hold-to-Complete & Tactical Undo",
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
            title: "TACTICAL UNDO MECHANICS",
            text: "Immediately upon completing a habit, an interactive system toast appears with a one-click [ UNDO ] action. You can also re-hold any completed card directly in your matrix or click [ UNDO LOG ] inside the habit's configuration drawer to instantly revert a mistaken check-in."
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
          "• 28-Day Consistency Heatmap: Visualizes your daily check-ins over the last 28 days directly inside the habit drawer.",
          "• 14-Day Trend Sparkline: SVG graph showing unit trends for Metric and Limiter habits.",
          "• Level, Current Streak, and Lifetime Total: Instant milestone tracking at a glance.",
          "• Full-Year Macro Analytics: Comprehensive 365-day heatmaps, weekly adherence rates, and long-term trends are accessible from the dedicated [ Analytics ] page in the sidebar."
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
        title: "Resolving Lockout (Penance Protocols)",
        tag: "RESOLUTION",
        content: [
          "To unlock your Command Center, click [ RESOLVE LOCKOUT ]. The system presents three tactical penance pathways to clear your strikes and restore operations:"
        ],
        subsections: [
          {
            title: "1. [ INCREASE DIFFICULTY ] (Target Escalation)",
            description: "Accept a permanent challenge increase on one of your active habits. The target value for your chosen habit increases by +33% (or tightens by -33% for limiter habits).",
            bulletPoints: [
              "Requires at least one active Metric or Limiter habit.",
              "For example, a target of 30 pushups raises to 40 reps, or a limiter cap of 3 coffees tightens to 2.",
              "Immediately upon selection, strikes reset to 0/5 and the viewport unlocks."
            ]
          },
          {
            title: "2. [ ADD NEW HABIT ] (Matrix Expansion)",
            description: "Commit to expanded daily discipline by provisioning an entirely new daily habit. The penance habit creation form opens inline, and upon saving, all 5 strikes are cleared."
          },
          {
            title: "3. [ ADD NEW TODO ] (Tactical Task Commitment)",
            description: "Formulate and schedule an urgent new task that must be completed. Submitting the task commits the record to your Todos matrix and reactively releases the system lockout."
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
            description: "Navigate to [ SETTINGS ] → [ DISCIPLINE ] → [ STRIKE SYSTEM DISCIPLINE ] and toggle 'Strike System Discipline'."
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
        title: "Waking Fuel Mechanics & Depletion",
        tag: "FUEL STATUS",
        content: [
          "The SleepTube operates on dynamic biological time, measuring the percentage of waking energy remaining before your target sleep window:"
        ],
        subsections: [
          {
            title: "Dynamic Circadian Calculation",
            description: "The gauge calculates elapsed time between your configured Wake-Up Time and Bedtime. If your sleep schedule crosses midnight (e.g. 09:00 AM wake-up and 01:00 AM bedtime), W automatically handles the night-owl rollover seamlessly."
          },
          {
            title: "Tactical Interval Markers",
            description: "Calibrated horizontal milestone ticks mark [ 100 ], [ 75 ], [ 50 ], [ 25 ], and [ 0 ] percent fuel levels, giving you an immediate visual cue of your day's decay."
          },
          {
            title: "Themed Fuel Luminescence",
            description: "The fluid inside the mercury track is illuminated with your chosen accent color (--accent) and features an ambient breathing glow pulse."
          },
          {
            title: "Zero Fuel / Depleted State",
            description: "When your waking window expires or your designated bedtime passes, the fluid drains completely to 0% and displays the tactical label [ DEPLETED ] (which can be customized to any phrase you choose in Settings)."
          }
        ],
        callouts: [
          {
            type: "tip",
            title: "CONFIGURING YOUR CIRCADIAN HOURS",
            text: "Head to [ SETTINGS ] → [ SLEEP TUBE ] to set your typical Wake-Up Time (e.g. 07:00), Bedtime (e.g. 23:30), and your custom empty tube text. The tube automatically scales smoothly in real time across the Dashboard and Desktop Widget."
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
        ],
        callouts: [
          {
            type: "tip",
            title: "NATURAL LANGUAGE CAPTURE (CTRL + K)",
            text: "You can also type 'new todo [task] [date] [priority]' directly in the Command Palette (Ctrl+K) to create tasks with dates and priorities without opening any dialogs."
          }
        ]
      }
    ]
  },
  {
    id: "desktop-widget",
    number: "07",
    title: "Desktop Companions & Sticky Notes",
    shortTitle: "Desktop Companions",
    iconName: "Monitor",
    summary: "Master the always-on-screen companion widget, floating desktop sticky notes, local coordinate persistence, and multi-monitor recall.",
    keywords: ["widget", "desktop", "hud", "always on top", "bottom pinned", "auto resize", "safe center", "sticky notes", "multi-monitor", "displays"],
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
      },
      {
        id: "desktop-sticky-notes",
        title: "Floating Sticky Notes & Multi-Monitor Recall",
        tag: "DESKTOP OVERLAYS",
        content: [
          "In addition to the widget HUD, W allows you to pin active tasks directly onto your desktop wallpaper as tactile sticky notes.",
          "Features include:",
          "• One-Click Desktop Pinning: From the Todos page, toggle the pin icon on any active task to cast it onto your desktop overlay.",
          "• Local-Only Persistence: All sticky note and widget screen coordinates are saved strictly to your local machine (widget_position.json and local storage). Coordinates are never sent to external cloud databases, preserving your privacy and local autonomy.",
          "• Multi-Monitor Topology Detection: If you position notes or the widget on a 2nd monitor and later boot your PC with only 1 monitor connected, W temporarily renders them inside the safe bounds of your primary screen so you never lose sight of your work.",
          "• Non-Destructive Hardware Auto-Recall: When your 2nd monitor is plugged back in, the system detects the display change in real time and automatically teleports all sticky notes and the widget back to their exact positions on your secondary screen."
        ],
        callouts: [
          {
            type: "tip",
            title: "RESETTING WIDGET POSITION",
            text: "If you ever lose track of your widget or notes across complex display setups, navigate to [ SETTINGS ] → [ DESKTOP COMPANIONS ] and click [ RESET WIDGET POSITION ] to safely recall it to your primary monitor."
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
          },
          {
            title: "Unified SSO & State Ownership Isolation",
            description: "Logging in with Google authenticates your profile and binds your personal Google Drive container in a single roundtrip. W embeds an ownership envelope (v2) with your authenticated email into W_state.json. If cloud state belonging to a different account is ever encountered, the sync engine immediately halts to eliminate cross-account data leakage and prevent cloud clobbering."
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
        title: "Distraction Elimination & Deep Work",
        tag: "FOCUS SESSIONS",
        content: [
          "When you need to enter deep work, willpower alone is not enough. The Lockdown engine enforces total environment hygiene by terminating distracting desktop software and blocking distracting websites during designated focus sprints."
        ],
        subsections: [
          {
            title: "Dedicated Command Center",
            description: "Access Lockdown directly from the primary sidebar by clicking [ LOCKDOWN ]. All target applications, website blocklists, sprint durations, and automated schedules are configured directly from this control hub."
          },
          {
            title: "Smart Category Presets & Custom Binaries",
            description: "Quickly toggle pre-configured process blocks for Gaming clients (Steam, Epic, Riot, Battle.net), Socials & Chats (Discord, Slack, WhatsApp, Telegram), Browsers, and Media Streaming. You can also specify any custom process name (e.g. game.exe) to enforce strict termination."
          },
          {
            title: "Timed Sprints & Recurring Schedules",
            description: "Trigger a 25-minute, 50-minute, or custom focus session with one click, or establish recurring daily focus blocks. While Lockdown is engaged, attempting to open a restricted app triggers an immediate block overlay and window termination to protect your focus."
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
    summary: "Quick-reference cheat sheet for global hotkeys, the Natural Language Command Palette (Ctrl+K), wallpaper customization, and data backups.",
    keywords: ["shortcuts", "hotkeys", "ctrl+k", "ctrl+n", "command palette", "nlp", "natural language", "create todo", "create habit", "delete", "direct execute", "wallpaper", "aesthetics", "backup", "tips", "tricks"],
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
            title: "Universal Hotkeys",
            description: "System commands accessible from anywhere:",
            bulletPoints: [
              "Ctrl + K — Universal Command Palette & Natural Language Engine",
              "Ctrl + N — Spawn Floating Quick Todo Creator",
              "Ctrl + / — Jump directly to this Field Manual",
              "Escape — Dismiss active modals, detail drawers, or search inputs"
            ]
          },
          {
            title: "Single-Key Quick Navigation (When Not Typing)",
            description: "Press these keys from any page when not typing in a text field for instantaneous page switching:",
            bulletPoints: [
              "H — Dashboard Command HUD",
              "T — Todos Matrix",
              "A — Analytics Center",
              "S — Settings & Preferences",
              "M — Field Manual",
              "N — Context-dependent New Item creation",
              "Space — Quick-complete currently focused habit"
            ]
          }
        ]
      },
      {
        id: "natural-command-palette",
        title: "Natural Language Command Palette (Ctrl + K)",
        tag: "POWER PROTOCOL",
        content: [
          "The Command Palette in W is not just a quick page switcher—it features a built-in, 100% offline, zero-latency Natural Language Engine that allows you to create and delete habits and todos instantly using natural English without rigid syntax.",
          "When a valid natural command is recognized, a glowing hero card appears at the very top of the palette. Pressing [ ENTER ] directly executes the action with zero confirmation dialogs, writes to local storage, and dispatches an instant system toast confirmation."
        ],
        subsections: [
          {
            title: "1. Creating Tasks (Todos) on the Fly",
            description: "Quickly schedule tasks with natural language dates and priority tags. The engine automatically extracts titles, relative deadlines, and urgency levels:",
            bulletPoints: [
              "'new todo Buy groceries tomorrow urgent' → Schedules task for tomorrow with high priority (crimson #ff4d4d accent)",
              "'add task Submit quarterly taxes by friday' → Automatically resolves the date to the upcoming Friday",
              "'todo Review pull request in 3 days p1' → Schedules task 3 days out with priority 1",
              "'remind me to Call bank' → Creates a standard task with no deadline"
            ]
          },
          {
            title: "2. Creating Habits & Routines",
            description: "Spin up new daily or weekly habits in seconds directly from your keyboard:",
            bulletPoints: [
              "'new habit Morning Meditation daily' → Instantly provisions a daily habit with target 1 completion per day",
              "'add routine Deep clean room weekly' → Provisions a weekly habit schedule",
              "'habit Cold shower each day' → Automatically parses recurrence and sets up tracking"
            ]
          },
          {
            title: "3. Direct Deletion & Safety",
            description: "Clean up obsolete items without opening menus or configuration drawers:",
            bulletPoints: [
              "'delete todo Buy groceries' → Directly removes the matching task and logs to Undo history",
              "'remove habit Morning Meditation' → Directly deletes the habit from the database",
              "'del task Bugfix' → Fast shorthand deletion"
            ]
          },
          {
            title: "4. Supported Keywords & Modifiers",
            description: "Natural English modifiers recognized across all commands:",
            bulletPoints: [
              "Relative Dates: today, tonight, tomorrow, in X days, by [monday-sunday], on [day]",
              "Priorities: urgent, critical, high priority, p1 (tags with crimson #ff4d4d accent)",
              "Recurrences: daily, weekly, every day, each week, every week"
            ]
          }
        ],
        callouts: [
          {
            type: "info",
            title: "DIRECT EXECUTE ARCHITECTURE",
            text: "All natural commands are executed directly upon pressing [ ENTER ] with zero modal prompts. A tactile system toast confirms the mutation instantly."
          },
          {
            type: "tip",
            title: "TACTILE COMPLETION PHILOSOPHY",
            text: "Task and habit completion is intentionally excluded from the Command Palette. In W, checking off a todo or logging a habit is designed to be experienced directly on the Dashboard, Habits grid, or Desktop Widget for maximum tactile satisfaction."
          }
        ]
      },
      {
        id: "aesthetics-customization",
        title: "Wallpapers & Custom Visual Aesthetics",
        tag: "AESTHETICS",
        content: [
          "Customize W to match your battlestation setup with dedicated customization controls in Settings:"
        ],
        subsections: [
          {
            title: "[ SETTINGS ] → [ WALLPAPERS ]",
            description: "Upload and calibrate custom desktop and widget backgrounds:",
            bulletPoints: [
              "Custom Wallpapers: Upload any local JPG or PNG image to serve as the backdrop for both the main Command Center and Desktop Widget.",
              "Position & Crop Editor: Drag and reposition images to frame them perfectly.",
              "Dim & Blur Sliders: Independently adjust background dimming (0% to 100%) and frosted glass blur (0px to 32px) to guarantee text readability over any wallpaper."
            ]
          },
          {
            title: "[ SETTINGS ] → [ APPEARANCE ]",
            description: "Tune tactical themes and system audio:",
            bulletPoints: [
              "Custom Accent Colors: Choose from Cyber Cyan (#5B8DEF), Neon Emerald (#4ADE80), Crimson Red (#E8736C), Amber Orange, or Deep Purple.",
              "Completion Audio: Toggle the subtle Web Audio API click feedback tone played when checking off protocols.",
              "Low Graphics Mode: Disables heavy backdrop blurs for lightning-fast performance on older or battery-conscious laptops."
            ]
          }
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
