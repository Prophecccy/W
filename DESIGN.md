---
name: W Command Center
version: "1.0"
description: >
  Industrial-grade habit enforcement system. Tauri v2 desktop shell
  with Firebase backbone, embedded desktop widget, and a Rust-native
  window management layer. Aesthetic: tactical HUD meets productivity forge.

colors:
  bg-base: "#08090a"
  bg-surface: "#111214"
  bg-elevated: "#1a1b1e"
  bg-overlay: "#222326"
  border-subtle: "rgba(255,255,255,0.06)"
  border-default: "rgba(255,255,255,0.10)"
  text-primary: "#e8e8e8"
  text-secondary: "#888888"
  text-muted: "#555555"
  accent: "#5B8DEF"
  strike-red: "#E8736C"

typography:
  t-display:
    fontFamily: Departure Mono
    fontSize: 33px
    letterSpacing: -2px
    fontWeight: normal
  t-label:
    fontFamily: Departure Mono
    fontSize: 9px
    letterSpacing: 3px
    textTransform: uppercase
  t-body:
    fontFamily: Departure Mono
    fontSize: 13px
    letterSpacing: -0.5px
    fontWeight: normal
  t-meta:
    fontFamily: Departure Mono
    fontSize: 9px
    letterSpacing: 2px
    textTransform: uppercase
  t-data:
    fontFamily: Departure Mono
    fontSize: 11px
    letterSpacing: 0
    fontFeature: tabular-nums

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px

rounded:
  sm: 4px
  md: 8px

components:
  habit-card:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    borderColor: "{colors.border-default}"
  lockout-overlay:
    backgroundColor: "rgba(232,115,108,0.15)"
    textColor: "{colors.strike-red}"
  widget-shell:
    backgroundColor: "rgba(17,18,20,0.88)"
    rounded: "{rounded.md}"
  sticky-note:
    backgroundColor: "rgba(17,18,20,0.88)"
    borderColor: "{colors.accent}"
---

# W — DESIGN.md

> Technical source of truth for the Command Center.
> All agents working on this codebase read this file before writing code.

---

## Overview

W is a desktop-native habit enforcement system that embeds itself into the Windows shell. It tracks habits, todos, alarms, and streaks across a unified command center with a persistent desktop widget pinned behind all windows.

The interface draws from two design lineages:
- **Arknights: Endfield** — Bracket-wrapped headers `[ SECTION ]`, monospace typography, industrial surface layering.
- **Linear** — Information density without noise, keyboard-first navigation, razor-sharp layout grid.

The product is not a wellness app. It is a tactical operations dashboard where missed obligations have consequences (strikes, lockouts, forced punishments) and sustained performance is rewarded with visual progression (flame tiers, level badges, confetti).

---

## Core Philosophy

### Industrial Productivity

Every pixel exists to serve a function. Decorative elements are prohibited unless they encode information (a shimmer on a card means Level 6+; a pulsing red border means lockout is imminent). The interface should feel like operating machinery — deliberate, precise, unforgiving.

### Tactical HUD

Headers are wrapped in brackets: `[ DASHBOARD ]`, `[ SETTINGS ]`, `[ LOCKED — OPEN APP ]`. This is not stylistic whimsy. Brackets signal system-level labels — they are machine identifiers rendered for human consumption. When you see brackets, you're reading a system status, not a decorative heading.

### Consequence Architecture

W is built on the principle that accountability without enforcement is decoration. The strike system, lockout overlay, and forced punishment flow exist to make inaction costly. The gap processor retroactively applies strikes for every missed day. There is no "soft reset."

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| **Shell** | Tauri v2 | Native Windows desktop app, multi-window management, IPC |
| **Frontend** | React 18 + TypeScript | UI rendering, state management, routing |
| **Build** | Vite | Development server, HMR, production bundling |
| **Backend** | Rust (Tokio) | Window z-ordering, hit-testing, background tick pacemaker |
| **Database** | Firebase Firestore | User data, habits, todos, logs, strikes, freeze state |
| **Auth** | Firebase Auth (Google) | OAuth via system browser flow |
| **Storage** | Firebase Cloud Storage | Wallpaper uploads (`.webp`) |
| **Local Storage** | Tauri `plugin-fs` | Alarms, timers, stopwatch, widget position, backups |
| **Notifications** | Tauri `plugin-notification` | Native OS toast notifications with browser fallback |
| **Styling** | Vanilla CSS + CSS Variables | No Tailwind. Design tokens in `index.css` |
| **Icons** | `lucide-react` | Outline style only. Dynamic names via `LucideIcon` helper |
| **Animation** | Framer Motion + CSS `@keyframes` | Page transitions, hold-to-verify, particle effects |
| **Font** | Departure Mono | Single typeface across entire application |

### Local-Only Data (No Cloud)

The following data never touches Firebase. It lives in `{appDataDir}/` via Tauri's filesystem plugin:

| File | Content |
|---|---|
| `alarms/alarms.json` | Alarm definitions (max 6) |
| `timers.json` | Timer state |
| `stopwatch.json` | Stopwatch state + laps |
| `widget_position.json` | `{ x, y, width, height }` in physical pixels |
| `sticky_positions` | `localStorage` key, debounced to Firestore |
| `backups/backup_{date}.json` | Full Firestore export snapshots (rolling 4) |
| `wallpapers/{slot}.webp` | Local copies of uploaded wallpapers |

### Wallpaper Pipeline

Wallpapers are uploaded to Firebase Storage as `.webp`, then downloaded and cached locally on the device. The widget and main app load wallpapers from local disk — never from a remote URL at render time. The `BroadcastChannel('w_channel')` synchronizes wallpaper changes between the main window and widget window.

---

## Architecture

### Window Model

W runs up to 4 simultaneous Tauri windows:

| Window | Label | Purpose | Decorations | Transparency |
|---|---|---|---|---|
| Main | `main` | Primary app shell | Yes (custom titlebar) | No |
| Widget | `widget` | Desktop habit tracker | No (frameless) | Yes |
| Sticky Overlay | `sticky-overlay` | Fullscreen note canvas | No (frameless) | Yes |
| Alarm Popup | `alarm-popup` | Wake-up overlay | No (frameless) | No |

### The Batch System

Development was executed across 18 sequential batches. Each batch was assigned to a single AI model (alternating between Claude Opus and Gemini), with `agent.md` as the handoff document. The batch boundaries were:

| Batch | Scope | Tasks |
|---|---|---|
| 1 | Project scaffolding, tokens, font | 1–16 |
| 2 | App shell, sidebar, command palette | 17–35 |
| 3 | Auth, onboarding, user doc | 36–49 |
| 4 | Habit data layer, engines | 50–70 |
| 5 | Habit UI, cards, forms, dashboard | 71–93 |
| 6 | Habit detail, daily note, grouping | 94–110 |
| 7 | Strike system, lockout, punishment | 111–128 |
| 8 | Gap processor, freeze system | 129–146 |
| 9 | Todo system, deadlines | 147–166 |
| 10 | Desktop sticky notes | 167–181 |
| 11 | Clock: alarms | 182–200 |
| 12 | Clock: timer + stopwatch | 201–216 |
| 13 | Widget window, WorkerW, PowerHub | 217–238 |
| 14 | Analytics dashboard | 239–258 |
| 15 | Settings, undo, backup, export | 259–280 |
| 16 | Wallpaper, notifications | 281–293 |
| 17 | Flame tiers, level visuals, confetti | 294–305 |
| 18 | Final integration, QA, cleanup | 306–320 |
| 19 | Daily Cycle & Waking Fuel | 321–335 |

Post-build restructuring decoupled the Dashboard from Habits into a unified Command Center layout.

### Dashboard as Unified Hub

The root `/` route renders `DashboardPage.tsx` — a split-screen Command Center:

```
┌──────────────────────┬──────────────────────┐
│   TODAY'S HABITS      │   ACTIVE TODOS       │
│   (Left Column)       │   (Right Column)     │
│                       │                      │
│   HabitCards with     │   TodoCards with      │
│   hold-to-verify      │   hold-to-complete   │
│                       │                      │
└──────────────────────┴──────────────────────┘
```

The dedicated `/habits` route hosts the full HabitsPage with group management, daily note, archive, and 3 layout modes (Default, Grouped, Custom).

### Feature Isolation

```
src/features/{feature}/
├── components/     # React components
├── hooks/          # Custom React hooks
├── services/       # Firestore/local CRUD
├── utils/          # Pure logic engines
├── types.ts        # Feature-specific types
└── index.ts        # Public API barrel
```

**Rule:** Never import from `features/X/services/internal.ts` directly. Always import through the feature's `index.ts` barrel or the specific public service file. Cross-feature coupling happens through shared types in `src/shared/types/`.

### Startup Sequence

```
Layout.tsx mounts
  → Phase 1: LOADING (auth check)
  → Phase 2: PROCESSING (gapProcessor runs)
    → checkAutoFreeze(lastActiveDate, today)
      → if gap ≥ 3 days → auto-freeze, skip to WELCOME_BACK
    → processGap(lastActiveDate, today)
      → day-by-day loop: check each habit schedule
      → add strikes for misses
      → check todo deadlines
    → update lastActiveDate
  → Phase 3: WELCOME_BACK (if auto-freeze triggered)
    → WelcomeBack.tsx renders
    → User clicks [ RESUME ALL HABITS ]
    → deactivateFreeze()
  → Phase 4: READY
    → Spawn widget window (Tauri only)
    → Spawn sticky overlay (Tauri only)
    → Render main content
```

---

## Feature Deep-Dives

### The Widget

The widget is a standalone Tauri window that pins itself behind all other windows on the desktop, functioning as an always-visible habit tracker.

#### Z-Order Architecture

The original approach embedded the widget as a child of Windows' `WorkerW` window (the desktop wallpaper container). This locked the window in place — no dragging was possible because `WorkerW` children cannot receive `WM_NCHITTEST` for move operations.

**Current solution:** The widget is a normal top-level window that uses native Win32 API calls to enforce `HWND_BOTTOM` z-ordering:

```rust
// workerw.rs — pin_to_bottom()
SetWindowPos(target, HWND_BOTTOM, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);

// Hide from Alt+Tab
SetWindowLongPtrW(target, GWL_EXSTYLE,
    (ex_style | WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW);
```

#### Active Defense (Z-Order Enforcer)

Interacting with a widget or sticky note in Windows DWM can trigger an OS-level activation that elevates the window. To counteract this, W implements an "Active Defense" system:
- **Pointer Down Hook**: `onPointerDown` handlers in `WidgetApp.tsx` and `StickyNote.tsx` perform a synchronous "slapdown".
- **Refocusing**: Immediately after interaction begins, the system invokes `pin_widget_bottom` (Rust) and calls `main.setFocus()` to forcefully return the main application to the foreground.
- **Goal**: Ensures that while the widget is interactive, it remains visually behind the main UI at all times, preventing it from "stealing" the workspace dominance.

#### Drag Mechanics

Widget dragging is fully synchronous. The React layer captures `onPointerDown` → computes `(dx, dy)` deltas with DPI scaling → fires `invoke('move_widget_by', { dx, dy })` as fire-and-forget. The Rust handler calls `GetWindowRect` + `SetWindowPos` with `SWP_NOZORDER` to move without disturbing the bottom-pinning.

After any drag or focus event, `pin_widget_bottom()` re-applies `HWND_BOTTOM` to prevent the widget from "popping" to the front.

#### Auto-Resize

The widget dynamically resizes its height based on the number of scheduled habits:

```
POWERHUB_H = 96px    (clock + ring + stats)
CARD_H     = 62px    (per habit card)
CARD_GAP   = 12px    (margin between cards)
FOOTER_H   = 32px    (strike badge)
INSET      = 16px    (border padding)

target = INSET + POWERHUB_H + (n × (CARD_H + CARD_GAP)) + FOOTER_H
clamped = clamp(260, target, 720)
```

Position and size are persisted to `widget_position.json` using `PhysicalPosition` / `PhysicalSize` — never logical pixels — to prevent exponential DPI inflation on high-DPI displays.

#### Waking Fuel (Time Tube)

The Waking Fuel system (represented by the `TimeTube` component) visualizes the passage of the user's conscious day. It is the primary pacing mechanism of the app, ensuring users feel the pressure of their waking window.

**Architecture:**
- **UserStore** (`userStore.tsx`): A centralized React Context that serves as the single source of truth for `wakeUpTime` and `bedTime`. It provides optimistic updates and handles Firestore synchronization.
- **Legacy Backfill**: On initialization, the app detects legacy users missing cycle data and patches them with defaults (`07:00`–`23:00`). This state triggers a `needsCalibration` flag.
- **Calibration Banner**: A tactical-style alert `[ CYCLE UNCALIBRATED ]` that appears on the Dashboard for users utilizing default times, providing a shortcut to the Schedule settings.

**The Night-Owl Engine** (`useTimeLeft.ts`):
The engine is designed to handle schedules that cross the midnight boundary (e.g., wake at 22:00, sleep at 06:00).
- **Phases**: The system identifies three distinct states: `awake` (within the window), `day-ended` (window passed, day over), and `sleeping` (current time is within the configured sleep window).
- **Calculation**: Total awake minutes are computed by treating the sleep time as `+24h` if it is numerically less than the wake time.
- **UI Feedback**: At 75%+ capacity, the tube fill shifts to amber. During the `sleeping` phase, the tube renders an empty "cooled down" state to signify rest.

**Notification Engine:**
The `useNotifications.ts` hook polls every 60 seconds. Two hours before `dailyResetTime`, if unfinished habits remain, it fires an OS-level "Evening Nudge" notification.

### The Strike System

Strikes are the enforcement mechanism. Every missed habit or overdue todo deadline generates a strike. At 5/5, the entire application locks.

#### State Machine

```
0/5 → Normal operation
3/5 → Warning toast fires ("⚠️ 3/5 STRIKES")
4/5 → Critical toast fires ("🚨 4/5 STRIKES")
5/5 → LOCKOUT
  → LockoutOverlay.tsx renders at z-index 9999
  → All interaction blocked
  → [ RESOLVE LOCKOUT ] button
  → PunishmentModal.tsx at z-index 10000
    → Choose 1 of 3:
      1. "Increase Difficulty" — target +33% on chosen habit
      2. "Add New Habit" — redirect to HabitForm
      3. "Add New Todo" — redirect to TodoForm
  → On confirm → resetStrikes() → current = 0
```

Strikes persist in the Firestore user document at `user.strikes`:
```typescript
interface StrikeState {
  current: number;         // 0–5
  history: StrikeHistoryEntry[];
  lastStrikeDate: string;  // YYYY-MM-DD
}
```

#### Gap Processor

The gap processor is the retroactive enforcement engine. It runs at startup, before the dashboard renders.

```
processGap(lastActiveDate, today)
  │
  ├── Auto-freeze check (gap ≥ 3 days → freeze all, return)
  │
  ├── For each day in (lastActiveDate+1 ... yesterday):
  │   ├── Skip if day is in a freeze range
  │   ├── For each active habit:
  │   │   ├── Skip if habit was created after this date (dynamically identifies oldest habit date)
  │   │   ├── Skip if not scheduled (scheduleEngine check)
  │   │   ├── Skip if completed in log
  │   │   ├── Skip if metric/limiter target met
  │   │   ├── Interval guard: one strike per due date
  │   │   └── → addStrike(habitId, title, "missed")
  │   └── Next day
  │
  ├── Check todo deadlines (deadlineChecker.ts)
  │   └── Past-due active todos → addStrike per todo
  │
  └── Update user.lastActiveDate = today
```

### Freeze System

Freeze pauses all penalty accrual. Two activation modes:

| Mode | Trigger | Start Date |
|---|---|---|
| **Manual** | User toggles in Settings | Today |
| **Auto** | Gap ≥ 3 days detected at startup | `lastActiveDate + 1` (retroactive) |

Auto-freeze shows the `WelcomeBack.tsx` screen — a full-screen warm blue overlay (deliberately non-threatening, no red) with a snowflake icon, the frozen date range, and a `[ RESUME ALL HABITS ]` button.

Freeze history is tracked as an array of `{ startDate, endDate, reason, daysCount }` entries pushed to `user.freeze.history` on deactivation.

### Todo Sticky Notes

Sticky notes are desktop-pinned representations of active todos, rendered on a fullscreen transparent overlay window (`sticky-overlay`). They allow users to see and complete todos directly on their desktop without opening the main app.

#### Data Model

Sticky notes are **not** a separate entity type. They are regular `Todo` items that have an optional `stickyPosition` field set:

```typescript
interface StickyPosition {
  x: number;  // CSS pixels, absolute on the overlay canvas
  y: number;
}

interface Todo {
  // ... standard todo fields ...
  stickyPosition?: StickyPosition;  // If set → pinned to desktop overlay
}
```

A todo becomes a sticky note when the user pins it (sets `stickyPosition`). Completing or archiving the todo removes it from the overlay. The `stickyPosition` field is stored in Firestore alongside the todo document, enabling cross-session and cross-device persistence.

#### Window Architecture

The sticky overlay is a fullscreen frameless transparent Tauri window (`sticky-overlay`) spawned at startup. It sits as a top-level window covering the entire screen with `pointer-events: none` on the canvas — only individual note cards receive pointer events.

**The Click-Through Problem:** Tauri v2's `setIgnoreCursorEvents(true)` has no `forward` parameter. When click-through is active, the webview receives **zero** events — including hover. You can't toggle from JavaScript because you never know when to toggle.

**Solution:** A Rust-side polling thread (`sticky_overlay.rs`) calls `GetCursorPos()` at ~60fps, checks cursor position against registered sticky note bounding boxes (sent from JavaScript via `update_sticky_regions`), and toggles `set_ignore_cursor_events()` on state change.

```
Cursor enters note region → set_ignore_cursor_events(false) → webview receives events
Cursor leaves all regions → set_ignore_cursor_events(true) → clicks pass through
During drag → DRAG_MODE = true → always interactive (prevents stutter)
```

**Why not `WH_MOUSE_LL` hooks?** Low-level mouse hooks require a Windows message pump on the installing thread. Tauri command handlers run on a Tokio thread pool — no message pump available.

#### Components

| Component | File | Role |
|---|---|---|
| `StickyCanvas` | `StickyCanvas.tsx` | Root container. Mounts on the overlay window. Subscribes to Firestore, manages hit-test lifecycle, renders `StickyNote` children. |
| `StickyNote` | `StickyNote.tsx` | Individual note card. Handles drag, hold-to-verify, completion, and visual rendering. |

**StickyCanvas** lifecycle:
1. On mount → `start_sticky_hit_test()` installs the Rust polling thread
2. Subscribes to a real-time Firestore query: all active todos where `stickyPosition` exists
3. On every layout change → debounced `update_sticky_regions()` sends note bounding boxes (in physical pixels, DPI-scaled) to Rust
4. On completion → calls `todoService.completeTodo()` and removes the local position cache entry

**StickyNote** renders:
- **Title** — Todo text, word-break enabled, monospace `t-body` tier
- **Deadline badge** — `OVERDUE` (red), `TODAY` (accent), or `{N}D` countdown
- **Numbered progress** — `current/target` badge + thin accent-colored progress bar
- **Hold fill overlay** — Framer Motion sweep animation during 500ms press-and-hold

#### Position Persistence (Dual-Layer)

Positions use a two-tier cache strategy to eliminate visual jank on startup:

| Layer | Storage | Speed | Sync |
|---|---|---|---|
| **L1 — Local** | `localStorage` key `w_sticky_positions` | Instant | Synchronous read on mount |
| **L2 — Cloud** | Firestore `todo.stickyPosition` | ~200ms | Debounced 1s write after drag end |

**Read path:** `useStickyNotes` loads L1 first (instant render), then subscribes to Firestore. When Firestore data arrives, it overwrites L1 positions. This means the user sees their notes in the correct position immediately, even before the network resolves.

**Write path:** After a drag ends, `savePositionLocal()` writes to L1 synchronously. `syncPositionToFirestore()` sets a 1-second debounce timer per `todoId` — rapid re-drags don't spam Firestore. `flushPendingSyncs()` is available for graceful shutdown.

```
Drag end → savePositionLocal(todoId, pos)     // L1: instant
         → syncPositionToFirestore(todoId, pos) // L2: debounced 1s
```

#### Drag Mechanics

Dragging bypasses React synthetic events entirely for maximum performance. The system uses **native `window`-level pointer listeners** with direct DOM manipulation:

1. `pointerdown` on the note element captures `(clientX, clientY)` start position
2. `pointermove` on `window` (passive) applies a CSS `transform: translate(dx, dy)` **directly** — no React re-render
3. A 5px movement threshold distinguishes drag from hold-to-verify
4. When drag starts:
   - `.sticky-note--dragging` class added (kills transitions, disables `backdrop-filter`, promotes to GPU layer)
   - Hold timer cancelled
   - `invoke('set_sticky_drag_mode', { dragging: true })` locks the overlay interactive
5. Viewport clamping prevents notes from being dragged off-screen
6. On `pointerup`:
   - Final `left`/`top` applied, `transform` cleared
   - React state synced via `setPos()`
   - `onDragEnd()` fires position persistence
   - 50ms deferred `sendStickyRegions()` updates Rust hit-test boxes (avoids DWM stutter from synchronous `SetWindowRgn`)
   - `set_sticky_drag_mode(false)` restores normal cursor polling

**Performance detail:** During drag, `backdrop-filter: blur(8px)` is disabled via the `.sticky-note--dragging` class. The blur forces a full re-sample + Gaussian blur of all background pixels on every frame — in a transparent Tauri window this tanks FPS below 30.

#### Completion Gestures

Three gesture variants, all sharing the 500ms hold-to-verify base:

| Todo Type | Gesture | Action |
|---|---|---|
| Standard | Hold 500ms → release | `completeTodo(id)` — removes from overlay |
| Numbered | Hold 500ms → release | `incrementNumberedTodo(id)` — increments `current`, stays visible |
| Numbered | Double-click + hold 500ms | `completeNumberedTodoFull(id)` — sets `current = target`, removes from overlay |

On completion, a CSS-only `@keyframes sticky-complete` animation plays (scale down + fade out over 500ms), then the component unmounts and `removePositionLocal()` cleans up L1 cache.

#### Visual Design

```
┌──────────────────────────┐
│  Todo title text here    │  ← t-body (13px), word-break
│                          │
│  ⏰ 3D  │  4/10         │  ← badges: deadline + numbered progress
│  ██████████░░░░░░░░░░░░  │  ← progress bar (numbered only)
└──────────────────────────┘
```

- **Background:** `rgba(17, 18, 20, 0.88)` with `backdrop-filter: blur(8px)` — glassmorphic
- **Border:** `1px solid var(--card-accent)` — uses the todo's assigned color
- **Sizing:** `min-width: 140px`, `max-width: 280px`, content-driven height
- **Hover:** `box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5)` — subtle lift
- **Cursor:** `grab` → `grabbing` during drag

### Gamification Layer

#### Flame Icon — 7 Tiers

| Tier | Streak Range | Visual |
|---|---|---|
| T1 | 1–6 | Simple static flame |
| T2 | 7–29 | Flicker animation |
| T3 | 30–59 | Double-layer flicker |
| T4 | 60–99 | Glow + particle pseudo-elements |
| T5 | 100–199 | Golden aura |
| T6 | 200–364 | Ember trail gradient |
| T7 | 365+ | Peak high-contrast |

All effects are CSS-only `@keyframes` — zero JavaScript animation loops. GPU-composited properties only: `transform`, `opacity`, `box-shadow`.

#### Level Badge — 11 Tiers

Levels follow a doubling progression table (Lv0 → Lv10). Each level adds cumulative CSS effects to the habit card:

| Level | Effect |
|---|---|
| 0 | Greyed out, no progression |
| 1 | Normal card |
| 2 | Accent border |
| 3 | Bold icon |
| 4 | Faint `box-shadow` glow |
| 5 | Increased glow radius |
| 6 | Shimmer border animation |
| 7 | Icon highlight filter |
| 8 | Gradient background |
| 9 | Premium border treatment |
| 10 | All effects at peak intensity |

#### Confetti Particles

CSS-only particle burst on habit completion. `ConfettiParticles.tsx` renders, plays `@keyframes`, then self-unmounts after the animation duration. No persistent DOM nodes.

---

## Design Tokens

### The 11px Rule

The base data unit is `11px` (`t-data` tier). All numerical displays — streak counts, strike counters, timer digits, analytics values — render at 11px with `font-variant-numeric: tabular-nums` for column alignment. This ensures every number in the system occupies identical glyph width regardless of digit.

### Typography System

Departure Mono is the sole typeface. Five tiers enforce a strict hierarchy — no ad-hoc `font-size` declarations are permitted anywhere in the codebase.

| Tier | Class | Size | Spacing | Use Case |
|---|---|---|---|---|
| Display | `.t-display` | 33px | -2px | Page headers: `[ DASHBOARD ]` |
| Label | `.t-label` | 9px | 3px, uppercase | Section headers, badges |
| Body | `.t-body` | 13px | -0.5px | Content text, descriptions |
| Meta | `.t-meta` | 9px | 2px, uppercase | Timestamps, metadata, captions |
| Data | `.t-data` | 11px | 0, tabular-nums | Numbers, counters, statistics |

### Color System

The palette is a 4-stop dark surface ramp with two semantic colors:

```
#08090a  ██  bg-base      — App background, deepest layer
#111214  ██  bg-surface   — Cards, sidebar, panels
#1a1b1e  ██  bg-elevated  — Hover states, active selections
#222326  ██  bg-overlay   — Modals, command palette, overlays

#e8e8e8  ██  text-primary    — Headlines, body text
#888888  ██  text-secondary  — Descriptions, secondary info
#555555  ██  text-muted      — Placeholders, disabled text

#5B8DEF  ██  accent       — User-configurable via Settings
#E8736C  ██  strike-red   — Strikes, lockout, danger states
```

### Dynamic `--accent` Color

The accent color is user-selected during onboarding and editable in Settings. It propagates to:
- Sidebar active indicator (left border)
- Habit card icon tint
- Progress rings and bars
- Command palette selection highlight
- Widget PowerHub ring
- Time Tube fill gradient
- Desktop and widget independently configurable via `user.aesthetics.{desktop|widget}.accentColor`

### Border System

```css
--border-subtle:  rgba(255,255,255,0.06)  /* Structural dividers */
--border-default: rgba(255,255,255,0.10)  /* Card outlines, input borders */
--border-color:   rgba(255,255,255,0.10)  /* Alias for default */
```

### Spacing Scale

```
4px   --spacing-xs   — Inner padding, icon margins
8px   --spacing-sm   — Card inner padding, compact gaps
16px  --spacing-md   — Section padding, standard gaps
24px  --spacing-lg   — Section separators
32px  --spacing-xl   — Page-level margins
```

### Animation Constraints

All animations must use GPU-composited properties only:
- ✅ `transform`, `opacity`, `box-shadow`, `filter`
- ❌ `width`, `height`, `top`, `left`, `margin`, `padding`

Global utility classes available:
- `.animate-pulse` — Scale bounce (1 → 1.05 → 1), 400ms
- `.animate-shake` — Horizontal jitter, 400ms
- `.animate-flash-red` — Inset box-shadow flash with `--strike-red`, 500ms

`body.low-graphics` class disables all expensive CSS animations, pseudo-element particles, and GPU-intensive keyframes.

---

## Conventions

### Bracket Headers

All page-level headings use bracket wrapping: `[ DASHBOARD ]`, `[ SETTINGS ]`, `[ ALARM ]`.
All action buttons use bracket wrapping: `[ CONFIRM ]`, `[ DELETE ]`, `[ UNDO ]`.
All badge labels use bracket wrapping: `[ DAILY ]`, `[ METRIC ]`, `[ FROZEN ]`.

### Hold-to-Verify Interaction

The primary completion gesture across the app is a 500ms press-and-hold:
1. User presses and holds a card
2. A fill animation sweeps left-to-right over 500ms
3. On release after 500ms → item completes
4. On release before 500ms → treated as a tap (opens detail view)
5. An 8-second `[ UNDO ]` toast appears at screen bottom

This pattern is identical on: `HabitCard`, `WidgetHabitCard`, `TodoCard`, `StickyNote`.

### Keyboard Shortcuts

| Key | Action | Context |
|---|---|---|
| `Ctrl+K` | Toggle Command Palette | Global |
| `H` | Navigate to Habits | Not in input |
| `T` | Navigate to Todos | Not in input |
| `A` | Navigate to Analytics | Not in input |
| `S` | Navigate to Settings | Not in input |
| `N` | Create new item | Dashboard → HabitForm, Todos → TodoForm |
| `Space` | Quick-complete first habit | Dashboard only |

---

## Rust Backend

### `lib.rs`
Tauri builder with plugin registration. Runs a Tokio-based `background-tick` pacemaker that emits events to the main window at 1-second intervals — used by timers and alarms to survive OS throttling during window minimization.

### `workerw.rs`
Widget window management. Exposes 4 Tauri commands:
- `embed_widget_in_desktop` — Initial HWND_BOTTOM pin + WS_EX_TOOLWINDOW
- `detach_widget_from_desktop` — Restore normal z-order
- `pin_widget_bottom` — Re-pin after drag/focus events
- `move_widget_by(dx, dy)` — Synchronous native window move

### `sticky_overlay.rs`
Fullscreen overlay hit-testing. Exposes 4 Tauri commands:
- `start_sticky_hit_test` — Launch 60fps polling thread
- `stop_sticky_hit_test` — Terminate polling
- `update_sticky_regions(rects[])` — Send note bounding boxes from JS
- `force_sticky_interactive` — Instant click-through disable
- `set_sticky_drag_mode(bool)` — Lock interactive during drag

---

## Future Roadmap

### Combat Proficiency Modules

> **Status:** Planned — not yet implemented.

Skill-based tracking system extending beyond binary habit completion. Intended to support:
- Proficiency levels per skill domain (e.g., "Programming", "Language", "Fitness")
- XP accumulation from linked habits
- Skill trees with prerequisite chains
- Weekly proficiency assessments

### System Audits

> **Status:** Planned — not yet implemented.

Automated self-assessment reports that evaluate:
- Strike frequency trends over 30/60/90 day windows
- Habit completion decay detection (declining rates)
- Schedule optimization suggestions (move habits to highest-completion days)
- Freeze pattern analysis (frequency, duration, seasonal correlation)

### Mobile Companion

> **Status:** Placeholder wallpaper slot exists (`user.wallpapers.mobile`). No app.

Lightweight mobile view for on-the-go habit completion. Would share the same Firestore backend with real-time sync to the desktop widget.

---

## Evolution Protocol — Auto-Updater

> **Status:** ✅ Batch 20 — Implemented and integrated.

### Architecture

The auto-update pipeline is built on three pillars:

1. **Tauri v2 Updater Plugin** — `tauri-plugin-updater` (Rust) + `@tauri-apps/plugin-updater` (JS). Signs NSIS installers with rsign2, verifies signatures before applying.
2. **GitHub Releases** — Acts as the update distribution server. The `latest.json` manifest is auto-generated and uploaded by the CI pipeline.
3. **Environment Guarding** — All updater logic is behind `isTauri()`. Browser dev mode never loads Tauri plugins.

### Signing Flow

```
┌─────────────────────────────────────────────────────────────┐
│ LOCAL                                                       │
│ updater.pub ─────→ tauri.conf.json (pubkey)                 │
│ updater ─────────→ GitHub Secret (TAURI_SIGNING_PRIVATE_KEY)│
│                    (never committed — .gitignored)           │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ CI (tauri-apps/tauri-action@v0)                             │
│ 1. Builds NSIS installer                                    │
│ 2. Signs with TAURI_SIGNING_PRIVATE_KEY → .nsis.zip.sig     │
│ 3. Generates latest.json (version, url, signature, notes)   │
│ 4. Uploads all artifacts to GitHub Release                  │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ CLIENT (useUpdateManager hook)                              │
│ 1. Fetches latest.json from releases endpoint               │
│ 2. Compares version against current                         │
│ 3. Downloads + verifies signature with embedded pubkey      │
│ 4. Applies update + relaunches                              │
└─────────────────────────────────────────────────────────────┘
```

### State Machine (`useUpdateManager.ts`)

```
idle ──→ checking ──→ available ──→ downloading ──→ ready
                   │                              │
                   └── idle (no update)           └── reboot()
                                                       │
                   error ◄──────────────────────────────┘
```

- **Dynamic imports:** `import('@tauri-apps/plugin-updater')` and `import('@tauri-apps/plugin-process')` are loaded at runtime only when `isTauri()` returns true.
- **Startup delay:** 5-second timer prevents the update check from contesting with Firestore hydration and gap processing.
- **Dismiss:** Session-scoped. Dismissed state resets on next app launch.

### HUD Design (`UpdateHUD.tsx`)

| Element | Spec |
|---|---|
| Position | Fixed, bottom-right (24px inset) |
| Font | Departure Mono, 9px labels |
| Background | `--bg-elevated` with 1px `--border-default` |
| Header | `[ SYSTEM UPDATE ]` in accent color |
| Version | `CURRENT → v{newVersion}` |
| Progress | 3px accent-colored bar with glow |
| Actions | `[ EVOLVE ]`, `[ RECALIBRATE & REBOOT ]`, `[ RETRY ]` |
| Animation | Slide-in from bottom, reboot button pulses |

---


## Development

```bash
# Dev mode (browser only — no native features)
npx vite dev

# Dev mode (full Tauri — widget, sticky notes, alarms)
npm run tauri dev

# Production build
npx vite build

# TypeScript check
npx tsc --noEmit
```

**Environment:** Windows 10/11 required for widget and sticky overlay features. The main app shell runs in-browser for development convenience, with graceful fallbacks for all Tauri APIs.
