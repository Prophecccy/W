# W — Agent Handoff Document

> **Purpose:** This file tracks the current state of the application architecture, tokens, and rules. All AI agents working on this project MUST read this file to understand the current context before making changes.

## Current State: COMMAND CENTER CALIBRATED 🛠️
The "W" project is a high-focus **Command Center**. It features a tactical dashboard with a side-by-side view of Habits and Todos, anchored by a **SleepTube** "Waking Fuel" gauge that monitors the user's daily progression based on their personalized sleep/wake cycle.

### Dashboard Command Center
- **Viewport Locking**: The dashboard is strictly constrained to `100vh`. Page-level scrolling is disabled (`overflow: hidden`).
- **Internal Scrolling**: Only the Habit and Todo list compartments are permitted to scroll (`overflow-y: auto`) when content exceeds the available vertical space.
- **SleepTube Calibration**: Anchor left, fixed max-height (400px), dynamic theme-based accent color. In the Desktop Widget, it is scaled to 200px and positioned on the left of a side-by-side layout.
- **Daily Note**: Fixed at the bottom of the viewport, non-resizable to prevent layout shifting.
- **Scrolling Constraint**: The main content area uses `flex: 1; min-height: 0; overflow-y: auto;` to ensure internal scrolling works correctly within the flexbox layout without breaking the footer/sidebar alignment.
- **Widget Layout**: Uses a `flex-direction: row` side-by-side layout. [ SleepTube ] is on the left; [ Habits | Stats | Footer ] on the right.

- **Status:** Stable. Feature set includes Dashboard, Habits, Todos, Analytics, and Desktop Widgets.
- **Core Loop:** Users manage daily habits and tasks. The **SleepTube** provides a visual timer for the day's "fuel" (waking hours). Missed habit targets trigger the **Strike Engine**.
- **Tech Stack:** Tauri v2 (Rust) + React (Vite/TS) + Firestore.

---

## Architecture Rules (Non-Negotiable)

1. **Feature Isolation:** Code is strictly grouped by feature under `src/features/`.
2. **No Cross-Feature Internals:** Never import from the internals of another feature. Always use the feature's `index.ts` (if it exists) or treat features as isolated modules.
3. **Shared UI:** Generic, reusable components reside in `src/shared/components/`.
4. **Pure CSS Styling:** Vanilla CSS only. No Tailwind. Use the design tokens defined in `src/index.css`.
5. **Iconography:** Use `lucide-react` in outline style. Use the `LucideIcon` helper for dynamic rendering.
6. **Typography:** Adhere to defined classes: `.t-display`, `.t-label`, `.t-body`, `.t-meta`, `.t-data`.
7. **Endfield Aesthetic:** Bracketed headers `[ NAME ]` are mandatory for page titles and section headers.
8. **Legacy Import Ban:** Do NOT use `import React from 'react'`. Use named imports for hooks/types (e.g., `import { useState } from 'react'`). JSX is handled by the `react-jsx` transform.

---

## File Map (Current Structure)

### Core & Layout
- `src/App.tsx`: Main entry point with `RouterProvider`.
- `src/app/Layout.tsx`: Main shell (200px sidebar, 44px topbar). Handles startup phases (loading → processing → ready).
- `src/app/routes.tsx`: Router configuration.
- `src/shared/stores/userStore.tsx`: Centralized state manager for the active User document (UserProvider).
- `src/index.css`: Global tokens, typography tiers, and base reset.

### Active Features (`src/features/`)
- **dashboard**: Unified Command Center. Left-anchored **SleepTube** (Waking Fuel) | Today's Habits | Active Todos. Includes a calibration banner for initial sleep cycle setup.
- **habits**: Core habit management. CRUD, Reordering, Daily Notes, Hold-to-verify cards.
- **todos**: Task management. Supports standard and "numbered" (counter) todos.
- **logbook**: Reading pane for historical habit notes and daily reflections.

- **analytics**: 30-day heatmap, consistency scoring, and habit-specific performance deep dives.
- **strikes**: The "Police" of the app. Manages strike incrementing, lockout overlays, and punishments.
- **sticky-notes**: Desktop overlay for pinned todos. Draggable, click-through capable, and persistent.
- **lockdown**: (Desktop-only) OS-level monitor that blocks blacklisted apps during focus sessions. *Currently in maintenance mode with a system under construction page.*
- **widget**: Desktop background widget. Stays pinned to the bottom of the OS Z-order.
- **freeze**: Automatic and manual "holiday mode" to prevent strikes during inactivity.
- **auth**: Firebase Google Auth and Onboarding flow (Accent/Reset configuration).
- **settings**: Sub-paged management shell. Includes **Schedule** configuration for Sleep/Wake times (Fuel Calibration).
- **updater**: "Evolution Protocol" — built-in auto-updater for Tauri.
- **wallpaper**: Custom wallpaper service with independent targets (Desktop, Widget, Mobile).

---

## Technical Deep Dives

### 1. Z-Order Defense (Widget)
The Widget (`src/features/widget`) uses a native Rust bridge (`workerw.rs`) to maintain its "Bottom-Pin" status.
- **Behavior:** On interaction, it triggers `pin_widget_bottom` (Rust) and forces focus back to the main app to prevent the widget from rising above other windows.
- **Dragging:** Handled via `move_widget_by` (Rust) to preserve Z-order during movement.

### 2. Sticky Overlay Hit-Testing
The Sticky Notes (`src/features/sticky-notes`) exist on a transparent, fullscreen overlay window.
- **The Problem:** Tauri's `setIgnoreCursorEvents(true)` is a total bypass; it cannot receive hover events to toggle interactivity.
- **The Solution:** A Rust polling thread (`sticky_overlay.rs`) checks the mouse position against note bounding boxes at 60fps. It toggles `WS_EX_TRANSPARENT` on the overlay window so the user can click a note but click "through" empty spaces.

### 3. Predictive Strike Risk Engine
Located in `src/features/habits/utils/heuristicEngine.ts`.
- **Logic:** Calculates failure probability (0-100) based on Time Pressure (exponential spike near reset), Variance (deviation from usual completion time), and Daily Load.
- **UI:** Habits with >75% risk pulse orange; >90% pulse red and fire native notifications.

### 4. Lockdown Mode (Desktop-Only) — Block Overlay Architecture
Monitors active window titles using `GetForegroundWindow` (Rust, 500ms polling).
- **Self-Lockout Safeguard:** PID comparison + hardcoded title checks (`W.exe`, `Command Center`) ensure the app NEVER blocks itself.
- **Block Overlay:** When a banned app gains focus, Rust calls `GetWindowRect` for the exact bounding box, emits a `lockdown-block` event with `{x, y, width, height}`. The React `useLockdown` hook repositions the `block-overlay` Tauri window (transparent, frameless, always-on-top) to snap perfectly over the target, intercepting all clicks.
- **Unblock:** When the banned app loses focus to a non-blocked window, Rust emits `lockdown-unblock` and the overlay hides.
- **No Strikes/Notifications:** The old punishment logic (`addStrike`, native notifications, `recordViolation`) has been fully purged. Lockdown is a pure visual block.
- **Block Overlay UI:** Dark frosted glass (`backdrop-filter: blur(8px); background: rgba(8,9,10,0.8)`) with `[ ACCESS DENIED ]` and `FOCUS PROTOCOL ACTIVE`.
- **Maintenance Overlay:** The frontend `LockdownPage.tsx` interface is temporarily replaced with an "Under Construction" / `[ SYSTEM MAINTENANCE ]` tactical screen while backend changes are being finalized.
### 5. SleepTube (Waking Fuel) System
The `SleepTube` (`src/features/dashboard/components/SleepTube.tsx`) is a vertical gauge monitoring the current "Waking Fuel" percentage.
- **Logic**: Powered by the `useTimeLeft` hook. Operates on a 16-hour (960m) cycle from **07:00 (100%)** to **23:00 (0%)**.
- **Formula**: `100 - ((minutesPassedSince0700 / 960) * 100)`.
- **Sticky UI**: Fixed at `350px-400px` height and `position: sticky` in the dashboard grid on Web to remain visible during list scrolling. On Tauri Desktop context (`isTauri()` detection), it dynamically stretches (`height: 100%; min-height: 400px; max-height: none`) to fill the container height, except when in Widget mode (`!isWidget`).
- **Widget Mode**: When the `isWidget` prop is true, it renders in a compact 200px height with simplified labels (`[ FUEL ]`) and slimmer track styling.
- **Dynamic Theme**: Uses `var(--accent)` for the fill color and outer glow, ensuring consistency with the user's selected theme.
- **Calibration UI**: Includes a high-precision measurement scale with static markers [100, 75, 50, 25, 0] aligned to the right edge of the tube track. Endpoint markers (100 and 0) have hidden ticks for a cleaner measuring instrument aesthetic.
- **Calibration**: If user settings are at default (07:00/23:00), the Dashboard displays a `[ CALIBRATION REQUIRED ]` banner linking to settings.

### 6. Frameless Window Drag Regions
To support native window movement in the frameless Tauri UI, specific elements use programmatic drag initiation.
- **Pattern:** Use `onPointerDown` with `getCurrentWindow().startDragging()` on container elements (e.g., Login background, controls bar).
- **Guard:** Always wrap in `if (e.target === e.currentTarget)` to prevent child elements (buttons, inputs) from triggering drags.
- **Why not `data-tauri-drag-region`?** The HTML attribute gets blocked by the DOM in frameless windows. The explicit JS API bypasses this.
- **Aesthetics:** Draggable areas use `user-select: none` to prevent text selection flickering during window movement.

### 7. Habit Creation Wizard
The Habit creation flow is a streamlined 6-step wizard (`src/features/habits/components/HabitForm`).
- **Flow:** Basics → Period → Type/Metric → Duration → Appearance → Grouping.
- **Type/Metric Step:** Metric and Limiter types allow capturing a custom target quantity and unit (metric label). Both values default to empty strings (`""`) to prevent default text trapping.
- **Sticky 1 Bypass:** The local Target Number state accepts an empty string (`""`) during active editing so the user can freely backspace.
- **Minimum 2 Validation Gate:** The step transition to Step 3 is physically blocked (disabling the `[ NEXT ]` button) if `targetValue` is less than `2` or if `unit` (metric label) is empty.
- **Input Spinner Nuking:** Standard HTML5 number spinner controls (arrows) are completely hidden using CSS in `HabitForm.css` to respect the minimalist typography aesthetic.
- **Appearance Step:** Focuses exclusively on iconography. The `ColorPicker` is omitted to maintain global theme consistency and prevent accidental overrides during habit setup.
- **Aesthetic:** The icon grid is expanded to fill the vertical space, adhering to the "Instrument" design philosophy.

### 8. Settings Navigation Design
The sidebar navigation of the settings page (`src/features/settings/components/SettingsPage.tsx`) implements high-scannability indicators.
- **Structure**: Configured via a structured static `TABS` array defining tab identifiers, custom labels, and specific icon assignments.
- **Icon Mapping**: Mapped tabs: `ACCOUNT` -> `User`, `APPEARANCE` -> `Palette`, `DESKTOP & WALLPAPERS` -> `Monitor`, `SCHEDULE & TIME` -> `Clock`, `NOTIFICATIONS` -> `Bell`, `DATA & SYSTEM` -> `HardDrive`.
- **Aesthetic Constraints**: Tabs use Flexbox (`display: flex; align-items: center; gap: 12px;`) to align outline-style Lucide icons before labels. Icons are sized strictly to `16px` to maintain typographical balance with `.settings-tab` fonts.
- **Transitions & Focus States**:
  - Inactive: Muted colors (`var(--text-muted)`) for both text and icons.
  - Hover: Smooth transition to full white (`#ffffff`) for text and icons with subtle background changes.
  - Active: Bold indicator styled in `var(--accent)` with a `border-left: 3px solid var(--accent)` active boundary marker.

### 9. Reactive Daily Reset & Date Shifting
To maintain consistent date boundaries across isolated processes in the Tauri application (the main App window and the pinned desktop Widget webview), the app implements a reactive date shifting architecture.
- **Problem**: In Tauri, separate webviews run in isolated JS contexts but share the same origin's `localStorage`. Direct background updates on one window do not trigger react-state updates in another.
- **Reactive Resolution**: The `getToday` utility shifted from a static day retriever to a dynamic timezone-aware date computer: `getToday(customDate?, resetTimeOverride?)`.
- **Dynamic Shifting Logic**: If a user's local clock is before their customized daily reset time (e.g. `02:30 AM` with a `04:00 AM` reset), the utility automatically shifts `today` to the previous calendar day (`YYYY-MM-DD - 1 day`). This ensures habit completions and log retrievals correctly map to "yesterday's" active period.
- **Multiprocess State Syncing**: 
  - The main dashboard's `UserProvider` writes the active user's Firestore daily reset time settings to `localStorage` under `w_daily_reset_time` synchronously *before* updating `setUserDoc` state to prevent rendering race conditions.
  - The desktop background Widget's `useWidgetData` snapshot listener dynamically receives `settings.dailyResetTime` via Firestore updates, reactively updates `localStorage`, and instantly unsubscribes/resubscribes to the correct day's habit logs `/logs/{today}`.
  - **Tauri IPC Real-Time Sync**: When a habit is completed or undone inside the desktop background widget (`useWidgetData.ts`), it emits a custom Tauri IPC event (`widget-habit-updated`). The primary app dashboard (`DashboardPage.tsx`) registers a global event listener inside a lifecycle-safe `useEffect` hook. On receiving this event, it increments a local `refreshTrigger` state counter, prompting an instantaneous, seamless data re-fetch and UI update to maintain parity across all active window processes.

### 10. System Tray (Notification Area)
The app registers a persistent Windows System Tray icon on launch so users running background processes (widget, overlays) can always regain control or fully exit.
- **Cargo feature**: `tauri = { features = ["tray-icon"] }` — must be present in `Cargo.toml`.
- **Config**: `tauri.conf.json` → `app.trayIcon` sets `iconPath`, `title`, and `tooltip` at bundle time.
- **Build location**: `src-tauri/src/lib.rs` → inside the `.setup()` closure using `TrayIconBuilder`.
- **Menu structure**:
  - `[ Show Command Center ]` — `MenuItem::with_id(app, "show", ...)` → calls `win.show()` + `win.set_focus()`
  - `---` separator via `PredefinedMenuItem::separator(app)`
  - `[ Quit 'W' ]` — `MenuItem::with_id(app, "quit", ...)` → calls `app.exit(0)` (kills all windows and processes)
- **Left-click** (single click on tray icon): Directly shows/focuses the main Command Center window via `on_tray_icon_event` matching `TrayIconEvent::Click { button: MouseButton::Left, ... }`.
- **Right-click**: Opens the native context menu (`.show_menu_on_left_click(false)`).
- **Exit path**: `on_window_event` intercepts the main window's close button (`CloseRequested`) and hides instead of closing, making the tray the **only** way to fully terminate the app. This is intentional — the user is never trapped because the tray is always visible.

### 11. Widget Layout & PowerHub Stats Deck
The desktop Widget app reconfigures the standard dashboard header and stats compartment into a compact, side-by-side modular layout:
- **Widget Header**: Renders the custom `[ W ]` brand logo alongside `[ ACTIVE PROTOCOLS ]` sub-text. The high-precision ticking clock has been relocated to the bottom compartment below the stats deck to prevent header wrapping.
- **PowerHub Stats Deck**: Located in the stats section. Renders a horizontal 3-column deck containing completed count, total habits count, and progress percentage separated by vertical hairline dividers.
- **Height Bounds Safeguard**: The stats deck and bottom clock are structurally designed to fit within the `POWERHUB_H = 170px` height budget mapped in `WidgetApp.tsx`'s auto-resize calculations to prevent window boundary overflow.

### 12. Habit Item Visual States
To ensure strict visual hierarchy and quick readability in the Widget list, four distinct CSS/DOM visual states are implemented for the Habit Items:
- **Active State (Default)**: Normal card rendering with `opacity: 1.0` and default typography.
- **Done Today State (Interacted Today)**: Applied to metric habits that have some progress (`interactedToday: true` / `doneToday: true`) but are not fully completed/committed. The card opacity is set to `0.7`, but the green `✓ DONE TODAY` tag stays bright and vibrant at `opacity: 1.0` and color `#4ade80`.
- **Pending Undo State (Grace Period)**: Active during the 8-second (`8000ms`) completion grace period. The card opacity is kept at `1.0`. A dynamic, absolutely-positioned `::after` pseudo-element at the bottom of the card animates its width from `100%` to `0%` using a linear keyframe transition over exactly 8 seconds to serve as the visual timer.
- **Committed State (Fully Completed)**: Reached after the 8-second undo grace period closes. The card opacity is reduced to `0.5` with muted borders and background. The title text receives a strike-through (`text-decoration: line-through`) and `color: var(--text-muted)` styling. The `✓ DONE TODAY` tag is completely hidden.

### 13. Interval Cooldown & UI Routing System
Introduced to enforce strict cooldown routines for 'interval' (every N days) habits.
- **Is Resting Calculation (Date Math):** Checked via the `isHabitResting(habit, userResetTime)` utility. It calculates the `nextActiveDate = lastCompletedDate + intervalDays` (incorporating the user's custom daily reset time). If the current time is before `nextActiveDate`, the habit is flagged as resting.
- **Active Surface Purge:** Pinned widget views (`useWidgetData.ts`) and the main Dashboard (`DashboardPage.tsx`) strictly filter out resting interval habits (`isResting === true`), removing them completely from active lists.
- **Holding Section:** In the main App's Habits tab (`HabitsPage.tsx`), resting habits are extracted into a separate group and rendered under a designated `[ INTERVALS ]` section at the bottom of the page in a faded visual state (`opacity: 0.65`).
- **Cooldown Display:** Within `HabitCard.tsx`, the standard hold-to-complete handlers and progress metrics are completely disabled and replaced with a monospace, muted bracketed cooldown message (e.g. `[ RETURNS IN 2 DAYS ]`, `[ RETURNS ON THURSDAY ]` or `[ RETURNS TOMORROW ]`) to clearly show remaining cooldown duration.

---


## Design System Tokens

### Colors
- `--bg-base`: `#08090a` (Deepest)
- `--bg-surface`: `#111214` (Cards/Sidebar)
- `--accent`: `#5B8DEF` (User-configurable)
- `--strike-red`: `#E8736C` (Critical actions/Strikes)

### Typography
- `.t-display`: `33px` — Page headers
- `.t-body`: `13px` — General text
- `.t-label`: `9px` — Caps, wide spacing, labels
- `.t-meta`: `9px` — Caps, wide spacing, muted info
- `.t-data`: `11px` — Tabular numbers

---

## Production Checklist
- **Firebase Secrets:** Production builds require 8 `VITE_FIREBASE_*` secrets in GitHub Actions.
- **Updater:** The app looks for `latest.json` in the GitHub repository's latest release.
- **NSIS:** Distribution uses a branded NSIS installer (`src-tauri/assets`).
