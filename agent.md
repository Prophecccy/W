# W — Agent Handoff Document

> **Purpose:** This file tracks the current state of the application architecture, tokens, and rules. All AI agents working on this project MUST read this file to understand the current context before making changes.

## Current State: BATCH 18 COMPLETE — BUILD COMPLETE 🏁
- **Status:** All 18 batches complete. Full integration verified, command palette upgraded, keyboard shortcuts wired, console cleanup done, TypeScript zero errors, production build passes.
- **All features:** Auth → Onboarding → Dashboard → Todos → Clock → Analytics → Settings → Widget → Strikes → Freeze → Backup → Export → Notifications → Gamification → Performance Mode

### Accomplished in Batch 1:
1. Tauri v2 + React (Vite/TS) app initialized
2. Core deps installed (`react-router-dom`, `framer-motion`, `lucide-react`, `firebase`)
3. `Departure Mono` font configured in `src/index.css`
4. Global design tokens and 5 typography tiers in `src/index.css`
5. Feature-based folder structure under `src/features/` and `src/shared/`
6. Shared types (`User`, `Settings`, `Aesthetics`) in `src/shared/types/index.ts`
7. Firebase config stub in `src/shared/config/firebase.ts`
8. Date utilities in `src/shared/utils/dateUtils.ts`

### Accomplished in Batch 2:
1. **Layout** (`src/app/Layout.tsx` + `Layout.css`) — CSS Grid: 200px sidebar + 44px topbar + content area
2. **Sidebar** (`src/shared/components/Sidebar/`) — NavLink routing with Lucide icons (Dashboard, Todos, Clock, Analytics, Settings), active state with accent left-border, Quick Stats section (streak + strikes)
3. **Topbar** (`src/shared/components/Topbar/`) — Ctrl+K search trigger, Tauri window controls (minimize/maximize/close with graceful browser fallback)
4. **CommandPalette** (`src/shared/components/CommandPalette/`) — Fuzzy search over pages, arrow key + Enter navigation, Escape to close, backdrop blur
5. **Keyboard Shortcuts** (`src/shared/hooks/useKeyboardShortcuts.ts`) — `Ctrl+K` toggles palette, `H`/`T`/`A`/`S` navigate pages (disabled while typing in inputs)
6. **5 Placeholder Pages** — DashboardPage, TodosPage, ClockPage, AnalyticsPage, SettingsPage with bracket-wrapped Display typography `[ PAGE ]`
7. **Routes** (`src/app/routes.tsx`) — React Router v6 with Layout wrapper and all child routes
8. **Global styles** — Added `.page-placeholder` centering and custom scrollbar styling to `index.css`

### Accomplished in Batch 3:
1. **authService.ts & useAuth.ts** — Google Auth logic and context providers
2. **LoginPage.tsx & AuthGuard.tsx** — Protected routes
3. **userService.ts & OnboardingPage.tsx** — User defaults and aesthetics selection

### Accomplished in Batch 4:
1. **types.ts** (Habit & HabitLog) — Created robust strict typings mapping to Firestore.
2. **habitService.ts** — Full CRUD + reordering helper for the "habits" collection.
3. **logService.ts** — Managing the daily document inside the "logs" subcollection.
4. **Engines** (`streakEngine.ts`, `levelEngine.ts`, `scheduleEngine.ts`) — Extracted core logic engines out of UI.

### Accomplished in Batch 5:
1. **HabitCard.tsx** — Advanced grid item with framer-motion hold-to-verify overlays, metric progress bars, dynamic level CSS glowing, and Limiter red-coding (`--strike-red`).
2. **Toast System** — Created global `ToastProvider` for generic UNDO notifications dynamically wired to the `App` tree.
3. **Shared Pickers** — Implemented `IconPicker` (65 curated lucide icons + search) and `ColorPicker`.
4. **HabitForm.tsx** — 7-step wizard (Basics → Period → Type → Config → Duration → Appearance → Grouping).
5. **DashboardPage.tsx** — Data-linked dashboard tracking uncompleted/scheduled habits vs Limiters (forced low priority) vs Completed habits. Integrated 3 layout modes.

### Accomplished in Batch 6:
1. **HabitDetail.tsx** — Right-sliding analytics panel: 28-day completion heatmap (7×4 grid), Level/Streak/Total stat boxes, SVG sparkline trend charts (14-day) for metric & limiter habits with threshold lines, editable name/description with locked period/type/frequency badges, `[ ARCHIVE ]` and `[ DELETE ]` actions.
2. **DailyNote.tsx** — Full-width journal textarea at dashboard bottom. 500ms debounced auto-save to `logs/{today}.notes`, character counter (0/5,000 limit).
3. **HabitGroupHeader.tsx** — Collapsible group header `[ GROUP NAME ]` with animated chevron toggle and habit count badge.
4. **groupService.ts** — Full CRUD for `users/{uid}/groups` Firestore subcollection: `getGroups`, `createGroup`, `updateGroup`, `deleteGroup`, `reorderGroups`.
5. **GroupManager.tsx** — Settings interface for groups: Add/Rename/Delete/Reorder (up/down arrows). Wired into `SettingsPage.tsx`.
6. **Deletion-Substitution Flow** — `[ DELETE ]` on HabitDetail prompts user to create a replacement habit; on successful creation the original is deleted via `deleteSubId` state in DashboardPage.
7. **dateUtils.ts** — Added `subtractDays()` for analytics date-range calculations.
8. **HabitCard.tsx** — Added `onClick` prop with hold-detection: short taps open HabitDetail, long-holds complete habit (using `hasHeldRef`).

### Accomplished in Batch 7:
1. **types.ts** (strikes) — `StrikeState`, `StrikeHistoryEntry`, `PunishmentChoice`, `PUNISHMENT_OPTIONS` constants, `MAX_STRIKES = 5`.
2. **strikeService.ts** — `getStrikes()`, `addStrike(habitId, habitTitle, reason)`, `resetStrikes()`, `isLockedOut()` — all operate on `user.strikes` in Firestore.
3. **punishmentService.ts** — `applyPunishment(choice, targetHabit?)`: "increase_difficulty" raises target by +33% inline, "add_habit"/"add_todo" return redirect signals for the UI.
4. **useStrikes.ts** — Real-time `onSnapshot` Firestore listener on user doc, exposes `{ strikes, isLocked, loading, addStrike, resolve }`.
5. **LockoutOverlay.tsx** — Full-screen `z-index: 9999` red overlay with pulsing ShieldAlert icon ring, 5 strike pips, `[ RESOLVE LOCKOUT ]` button.
6. **PunishmentModal.tsx** — 3 selectable punishment cards with confirm flow, `z-index: 10000` (above lockout).
7. **StrikeWarningToast.tsx** — Side-effect component that fires toast at 3/5 and 4/5 strikes on increment.
8. **Sidebar.tsx** — Accepts `strikeCount` prop, displays dynamic `X/5`, CSS pulse animation at warning (3+) and infinite pulse at locked (5).
9. **Layout.tsx** — Orchestrates the full flow: `useStrikes()` → passes count to Sidebar → renders `StrikeWarningToast` → conditionally mounts `LockoutOverlay` → opens `PunishmentModal` on resolve.

### Accomplished in Batch 8:
1. **gapProcessor.ts** — `processGap(lastActiveDate, today)`: day-by-day loop from `lastActiveDate+1` to `yesterday`. For each day: checks all active habits via `isHabitScheduledToday()`, marks misses, calls `addStrike()`. Interval habits get ONE strike per due date (tracked via `Set<"habitId:date">`). Skips frozen days via `isDateInFreezeRange()`. Updates `user.lastActiveDate = today` after processing.
2. **freeze/types.ts** — `FreezeState` interface: `active`, `startDate`, `endDate`, `reason`, `lastInteractionDate`, `history[]`. `AUTO_FREEZE_THRESHOLD_DAYS = 3`.
3. **freezeService.ts** — `activateFreeze(reason, startDate?)`, `deactivateFreeze()` (pushes to history), `checkAutoFreeze(lastInteractionDate, today)` (auto-activates if gap ≥ 3 days, retroactive start date), `isCurrentlyFrozen()`, `isDateInFreezeRange()`, `isDateFrozen()`, `updateInteractionDate()`.
4. **WelcomeBack.tsx** — Full-screen return screen with snowflake icon, frozen date range display (start → today), day count, `[ RESUME ALL HABITS ]` button that calls `deactivateFreeze()`. Warm blue design (no red/threatening colors).
5. **ManualFreezeToggle.tsx** — Settings component: shows freeze status, activate/end buttons, duration since frozen, previous freeze count. Wired into `SettingsPage.tsx`.
6. **Layout.tsx** — Rewrote with phase-based startup: `loading` → `processing` (gap processor) → `welcome_back` (if auto-freeze triggered) → `ready`. Gap processor runs before dashboard, auto-freeze shows WelcomeBack screen.
7. **User type** — Added optional `freeze` field to `User` interface in `shared/types/index.ts`.

### Accomplished in Batch 9:
1. **types.ts** (todos) — Strict v2 schema: `id`, `title`, `description`, `type` ("standard" | "numbered"), `status` ("active" | "done"), `color`, `numbered` (target/current tracking), `deadline`, `future`, `stickyPosition`, `order`.
2. **todoService.ts** — Full CRUD API mapping to `users/{uid}/todos`: `createTodo`, `getTodos`, `getCompletedTodos`, `updateTodo`, `completeTodo`, `incrementNumberedTodo`, `completeNumberedTodoFull`.
3. **deadlineChecker.ts** — Evaluates past-due active todos. Missed deadlines programmatically invoke `addStrike()` and strip off the deadline to convert it to an active fallback state.
4. **gapProcessor.ts** — Seamlessly wired `deadlineChecker.ts` inside the gaps process stream alongside habit interval checking.
5. **UI Components** — 4-Step `TodoForm.tsx` supporting numbered logic and appearance toggles. Compact `TodoCard.tsx` incorporating hold-to-complete semantics.
6. **TodosPage.tsx** — Tri-state layered screen: Active (display mapped), Upcoming (Future dates + `habitService.ts` Interval habits waiting for queue), Completed (Collapsible 50-limit auto-purged layer).

### Accomplished in Batch 10:
1. **tauri.conf.json** — Added second window `sticky-overlay`: `decorations: false`, `transparent: true`, `fullscreen: true`, `skipTaskbar: true`, `alwaysOnBottom: true`, `visible: false`. Renamed product to `W`.
2. **capabilities/default.json** — Added `sticky-overlay` window permissions: `set-ignore-cursor-events`, `show`, `hide`, `set-fullscreen`, `set-always-on-bottom`, `set-position`.
3. **StickyCanvas.tsx** — Full-screen transparent container. Initializes Tauri click-through via `setIgnoreCursorEvents`, exports `enableCursorEvents`/`disableCursorEvents` for child components. Renders all active todos with `stickyPosition` as `StickyNote` components.
4. **StickyNote.tsx** — Draggable sticky note with pointer events: 5px movement threshold before drag starts, screen-bound constraining. Hold-to-complete (500ms): standard → complete + animate away, numbered → increment +1, double-click-and-hold → full complete. `onMouseEnter/Leave` toggles click-through.
5. **StickyNote.css** — Dark translucent bg `rgba(17,18,20,0.88)` with backdrop blur, 1px colored outline via `--card-accent`, deadline/overdue badges, numbered progress bar, hold-fill overlay, completion fade+scale animation.
6. **positionStore.ts** — `localStorage`-based fast cache (`w_sticky_positions` key) with 1-second debounced Firestore sync via `updateTodo(todoId, { stickyPosition })`. `flushPendingSyncs()` for cleanup.
7. **useStickyNotes.ts** — Real-time `onSnapshot` listener on `users/{uid}/todos` where `status == "active"`. Loads local position cache first (instant render), then overwrites with Firestore data.
8. **Layout.tsx** — Phase 3 added: on `ready`, dynamically spawns `sticky-overlay` window via `WebviewWindow` from `@tauri-apps/api/webviewWindow`. Gracefully skips in browser dev mode.
9. **routes.tsx** — Added `/sticky-canvas` route (AuthGuard-wrapped, no Layout shell).

### Accomplished in Batch 11:
1. **Clock Data Layer**: Added `Alarm`, `Timer`, and `Stopwatch` types. Built `alarmService.ts` with local CRUD persisted to `{appDataDir}/alarms.json` via `@tauri-apps/plugin-fs`.
2. **Audio & Window Backend**: Added `@tauri-apps/plugin-dialog` to support native audio selection. Built `audioService.ts` that implements local audio playback with `convertFileSrc`. Added `alarm-popup` window config. Built tokio-based Rust internal pacemaker to beat main window tracking throttle.
3. **Clock UI**: Designed `ClockPage.tsx` with 3 tabs. Finished `AlarmList` showing toggles/days. Finished `AlarmForm` incorporating 60fps CSS scroll-snap wheels (`TimePickerWheel`), native file dialog for sound selection, and snooze settings.
4. **Alarm Popup**: Developed `AlarmPopup.tsx` frameless overlay with pulsing red borders. Includes interactive snooze countdowns and 5-minute auto-stop logic.
5. **Task Tracker Checkpoint**: Marked tasks 182-200.

### Accomplished in Batch 12:
1. **Notifications**: Integrated `@tauri-apps/plugin-notification` to handle OS-level native alerts when running Timers hit zero.
2. **Robust Clock Infrastructure**: Established `Date.now()` timestamping in states combined with `background-tick` to trigger robust, sub-second unthrottled timer checks across minimizations and OS throttling.
3. **Timer Service**: Designed `TimerPanel` and `TimerCard` componentry supporting up to 6 distinct countdown timers mapped to `timers.json`.
4. **Stopwatch Service**: Designed `StopwatchPanel` taking advantage of `requestAnimationFrame` for 60fps local display while safely syncing to `stopwatch.json` seamlessly mapping timestamps so it can be resumed indefinitely without drift. Including lap lists.

### Accomplished in Batch 13:
1. **WorkerW Embedding Plugin**: Created `src-tauri/src/workerw.rs` Rust plugin that finds the desktop `WorkerW` layer via `FindWindowEx` + `0x052C` message to Progman, embeds the widget via `SetParent`, and sets `WS_EX_TOOLWINDOW` to hide from alt-tab/taskbar. Graceful non-Windows fallback stubs.
2. **Tauri Widget Window**: Added 4th window config `widget` in `tauri.conf.json` — frameless, transparent, resizable (300×400 to 600×900, default 380×520). Updated capabilities with all required permissions.
3. **Widget App Shell** (`WidgetApp.tsx`): Standalone React tree with no Layout/sidebar/topbar. Renders PowerHub + WidgetHabitList. Includes wallpaper background with dim overlay, lockout overlay (`[ LOCKED — OPEN APP ]`), and frozen state desaturation.
4. **PowerHub** (`PowerHub.tsx`): Live-updating `[ HH:MM ]` digital clock, 120px SVG progress ring with accent-colored fill, quick stats row (🔥streak · ⚠️strikes · 📈weekly). Frozen state replaces streak with `⏸ FROZEN`.
5. **WidgetHabitCard** (`WidgetHabitCard.tsx`): 36px compact row with hold-to-verify (500ms fill animation), 8s undo window, per-habit streak badge, completed strike-through with faded opacity.
6. **WidgetHabitList** (`WidgetHabitList.tsx`): Auto-sorts completed habits to bottom. Separates regular habits from `[ LIMITERS ]` section.
7. **useWidgetData Hook**: Real-time Firestore `onSnapshot` listeners on habits, today's log, and user doc. Computes derived data (scheduledHabits, completedCount, globalStreak). Exposes completeHabit/undoHabit actions.
8. **Widget Position Persistence** (`widgetPositionStore.ts`): Saves `{ x, y, width, height }` to `widget_position.json` in AppData with 500ms debounce. Restores on startup via Tauri `setPosition`/`setSize`.
9. **Layout.tsx Integration**: Phase 3 now launches both sticky-overlay and widget windows. Widget embedding into WorkerW is attempted with 500ms delay, falling back to normal float if unavailable.

### Accomplished in Batch 14:
1. **Analytics Engine** (`analyticsService.ts`, `types.ts`): Comprehensive aggregation engine matching V2 API semantics. Generates `MonthlySummary` and `WeeklySummary`. Computes metrics like completion rates (overall/month/week), streak proximity (`longest - current`), consistency ranking, most improved, and day-of-week averages (best/worst days).
2. **Dashboard Shell** (`AnalyticsPage.tsx`): 3-tier deep dashboard. Top tier: Smart Insights horizontally scrollable list. Middle tier: Core visual comparisons. Bottom tier: Individual Habit Deep Dive toggle panel.
3. **Smart Insights**: Displays dynamic computation showing Best Day, Worst Day, Streak Proximity, and Most Consistent habits.
4. **Activity Heatmap** (`ActivityHeatmap.tsx`): Custom CSS grid-based GitHub-style contribution graph stretching back 90 days. Evaluates completion density per day mapped to scaling green opacity modifiers via inline variables. Incorporates hover tooltip reporting.
5. **Timeline Review** (`TimelineReview.tsx`): Horizontally scrolled axis tracking all previously logged punishment events mapped to specific trigger dates. Visually emphasizes critical lockout density to warn users.
6. **Habit Deep Dive** (`HabitDeepDive.tsx`): High detail component per-habit mapping time-of-day completion bar charting, value progression tracking for metric tracking tasks, along with completion rate calendars tracking individual habit success dates.
7. **Consistency Score Widget** (`ConsistencyScore.tsx`): Weighted 0-100 radial calculation mapping global performance evaluating total strike hits linearly scaled against global successful habit strike records.
8. **Custom Visualizations**: Created completely custom SVG line `ChartMonthlyComparison` and CSS Div `ChartWeeklyComparison` components matching high-end departure mono aesthetics avoiding complex slow graphing dependencies. Built native Framer Motion animated drawing paths mapping SVG height values based on dataset highs.

### Accomplished in Batch 15:
1. **Settings Page** (`SettingsPage.tsx`, `SettingsPage.css`): Full sectioned layout with 8 sections (Account, Appearance, Schedule, Notifications, Data, Groups, Freeze, Undo History). Dark industrial aesthetic with bracket headers, custom toggle switches, and clean form inputs.
2. **Account Section** (`AccountSection.tsx`): Displays Google profile photo, display name, email, and membership date. Sign-out button with confirmation dialog.
3. **Appearance Section** (`AppearanceSection.tsx`): Reuses existing `ColorPicker` for accent color selection (updates all contexts — desktop, widget, mobile). Completion sound toggle persisted to Firestore.
4. **Schedule Section** (`ScheduleSection.tsx`): Daily reset time picker (`<input type="time">`), weekly reset day selector, timezone dropdown (populated from `Intl.supportedValuesOf`). All changes debounced 500ms.
5. **Notifications Section** (`NotificationsSection.tsx`): Master toggle that disables all sub-toggles when off. Sub-toggles: Evening Nudge, Strike Warnings, Lockout Alert, Weekly Summary. Each persisted immediately.
6. **Undo History Service** (`undoService.ts`, `undoTypes.ts`): Firestore-backed (`users/{uid}/undoHistory/`) action logging with 6 tracked types: `habit_complete`, `habit_uncomplete`, `todo_create`, `todo_delete`, `todo_complete`, `strike_added`. Each action stores reverse operation data. `undoAction()` executes the stored reverse. `purgeOldEntries()` enforces 7-day rolling retention.
7. **Undo History UI** (`UndoHistory/UndoHistory.tsx`): Timeline-style display grouped by day (`[ TODAY ]`, `[ YESTERDAY ]`, `[ APR 2 ]`). Each entry shows action-type icon + description + timestamp + `[ UNDO ]` button. Non-undoable actions (strikes) display without undo button.
8. **Backup Service** (`backupService.ts`): Creates local JSON backups at `{appDataDir}/backups/` via Tauri FS API. Rolling limit of 4 backups. Weekly auto-backup check on startup. Falls back to browser download when Tauri unavailable.
9. **Export Service** (`exportService.ts`): `exportJSON()` dumps all Firestore data as formatted JSON. `exportCSV()` generates structured CSV with sections for habits, todos, and daily logs. Both use `Blob` + `URL.createObjectURL` for browser-native download.
10. **Data Section** (`DataSection.tsx`): `[ CREATE BACKUP NOW ]`, `[ EXPORT JSON ]`, `[ EXPORT CSV ]` buttons. Displays last backup date.
11. **Completion Sound** (`completionSound.ts`): Web Audio API programmatic tick/click sound (1800→600Hz sine tap + 20ms noise burst). Integrated into `HabitCard.tsx` hold-to-verify handler.
12. **Type Updates**: Added `completionSound: boolean` to `Settings` interface with `true` default in `userService.ts`.
13. **GroupManager** and **ManualFreezeToggle**: Pre-existing components integrated into the new sectioned layout (no changes needed).

### Accomplished in Batch 16:
1. **Wallpaper Service** (`wallpaperService.ts`): Built Firebase Storage integration to upload `.webp` files, generate URLs, and update the Firestore `user.wallpapers` payload. Handles Desktop, Widget, and Mobile device targets independently.
2. **Wallpaper UI** (`WallpaperPicker.tsx`): Built specific sub-component within Settings allowing independent square thumbnail previews matching selected targets. Integrates a custom file upload routine mapping to `wallpaperService`.
3. **Dynamic CSS Wallpaper Injection**: Modified `Layout.tsx` and `index.css` to dynamically map `doc.wallpapers.desktop` into an underlying `body::before` styled element. Supports matching visual opacity dimming tied to `aesthetics.desktop.dimIntensity`.
4. **Notification Service** (`notificationService.ts`): Built hybrid wrapper calling Tauri's `@tauri-apps/plugin-notification` when natively running, seamlessly gracefully handling failures falling back to standard `Notification` browser APIs prioritizing multi-environment resilience.
5. **Scheduled Time Nudges** (`useNotifications.ts`): React hook internally driven through 60000ms `setInterval`. Polling mechanism automatically computes daily limits comparing current system time precisely 2 hours prior to the `dailyResetTime` configured inside User Document discharging target payload. Includes specific guard ref enforcing exact one-time single payload triggers.
6. **Trigger Lockout Alert System**: Embedded deep logic within `strikeService.ts`, calculating incoming Strike allocations intercepting matching MAX_STRIKES threshold arrays broadcasting `⚠️ APP LOCKED` messages matching specific configured user toggle sets.
7. **Strike Warnings Alert System**: Hooking `strikeService.ts`, triggers at strictly exactly identical limits matching threshold limits array bounds `=== 3 || === 4` firing `🚨 STRIKE WARNING` payloads.
8. **Weekly Summarisation Toggles**: Built specific `currentHour === 9 && currentMinute === 0 && todayDay === settings.weeklyResetDay` trigger handling firing `📊 Weekly Summary` deep analytical link prompts.

### Accomplished in Batch 17:
1. **FlameIcon Component** (`FlameIcon.tsx`, `FlameIcon.css`): Built a 7-tier SVG visual system that evolves dynamically based on streak. Uses zero-JS CSS animations: simple (T1-T2), double-layer flicker (T3), particles + glow (T4-T5), ember trails (T6), peak high contrast (T7). Integrated to `HabitCard` and `Sidebar`.
2. **LevelBadge Component** (`LevelBadge.tsx`, `LevelBadge.css`): Visual level badge supporting 11 distinct rendering tiers (Lv0-Lv10) scaling from standard strings to animated shimmers and premium gradient glassmorphism.
3. **Card Tiers** (`HabitCardTiers.css`): Merged full frame visual tiers onto `HabitCard` scaling borders, drop shadows, background shimmers, and full shift mapping based on `habit.level`.
4. **Confetti Particles** (`ConfettiParticles.tsx`, `ConfettiParticles.css`): Lightweight, zero-JS CSS keyframe based particle burst system rendering upon goal completion and self-unmounting.
5. **Micro-interactions**: Added `AnimatePresence` to main `Layout.tsx` providing globally smooth 150ms crossfade transitions. Added `.animate-pulse`, `.animate-shake`, and `.animate-flash-red` utility classes to `index.css` for future global injection. Added subtle hover brighten to the `Sidebar`.
6. **ProgressRing Component** (`ProgressRing.tsx`): Built generic standalone SVG circular progress ring supporting standard variables, easing, and customized thickness.
7. **Low Graphics Mode**: Wired `lowGraphicsMode` from `Settings` interface to inject `low-graphics` class on body, immediately terminating heavily performance-taxing DOM elements, pseudo-elements, and GPU intensive keyframes.

### Accomplished in Batch 18 (Final Integration & QA):
1. **Enhanced Command Palette**: Upgraded `CommandPalette.tsx` to accept habits and todos data. Fuzzy matches habit names, todo titles, and action keywords. Results grouped into `[ PAGES ]`, `[ ACTIONS ]`, `[ HABITS ]`, `[ TODOS ]` sections.
2. **Palette Actions**: Added "Complete [habit name]" actions (one per active habit), "Create New Habit", and "Create New Todo" commands.
3. **Keyboard Shortcut `N`**: Context-dependent new item creation. On Dashboard → opens HabitForm. On Todos → opens TodoForm. Uses custom `w:open-habit-form` / `w:open-todo-form` events.
4. **Keyboard Shortcut `Space`**: Quick-complete the first scheduled habit on Dashboard via `w:quick-complete` event. `focusedIndex` state provisioned for future arrow-key focus navigation.
5. **Console Cleanup**: Removed all `console.log` from `alarmScheduler.ts` (3 instances). Retained `console.error` (legitimate catch handlers) and `console.warn`/`console.info` (operational lifecycle messages).
6. **Punishment Redirect**: Wired `PunishmentModal` results to navigate + emit form-open events ("redirect_habit" → Dashboard + HabitForm, "redirect_todo" → Todos + TodoForm).
7. **Low Graphics Mode Injection**: Added `body.low-graphics` class injection in Layout.tsx startup based on user settings.
8. **TypeScript Zero Errors**: `tsc --noEmit` passes clean.
9. **Production Build**: `npm run build` passes clean.

### Accomplished in Post-Build Restructure (Dashboard decoupling):
1. **Habits Separation**: Extracted all habit management logic from the original `DashboardPage` into a dedicated `HabitsPage.tsx` (route `/habits`).
2. **Unified Dashboard**: Built a new `DashboardPage.tsx` at the root `/` route serving as a "Command Center". Implemented a side-by-side split layout showing Today's Habits (Left) and Active Todos (Right).
3. **Navigation Updates**: Added "Habits" (Target icon) to `Sidebar.tsx`. Updated `CommandPalette.tsx` to include the Habits page.
4. **Event-Driven Forms**: Fixed cross-page form summoning. Keyboard shortcut `N` and dashboard "+ ADD" buttons now navigate to the respective feature page before firing `w:open-habit-form` or `w:open-todo-form` with a 50ms safety timeout to ensure mounting.
5. **Analytics UI Polish**: Standardized `ChartWeeklyComparison` to always pad to a 7-day grid. Added frosted-glass empty states for missing analytics data.

### Accomplished in Desktop & Widget Settings:
1. **Shared Tauri Utility** (`tauri.ts`): Centralized environment detection (`isTauri`) and safe external link handling (`openExternalLink`) with fallback logic for web/Tauri environments.
2. **Environment-Aware Settings UI** (`DesktopSection.tsx`): Built a dynamic component that adapts its content based on the runtime.
   - **Web:** Prominent "Download for Windows" hero card highlighting widget features and linking to GitHub releases.
   - **Desktop:** Management panel with "Re-launch Widget" and "Reset Widget Position" tools.
3. **Widget Rescue Tools**: Implemented `resetWidgetPosition` in `widgetPositionStore.ts` and wired `Layout.tsx` event listeners (`w:launch-widget`) to allow manual window recovery without app restarts.
4. **Branded Aesthetics**: Applied the "W" gold/black aesthetic with bracketed headers and stylized feature tags to the new section.

### Accomplished in Branding & UI Polish:
1. **NSIS Installer Branding**: Replaced default 90s-style installer graphics with custom branded assets. Configured `tauri.conf.json` to use `header.bmp` (150x57) and `sidebar.bmp` (164x314) for a premium "Black & Gold" installation experience.
2. **Alarm Persistence Fix**: Refactored `alarmService.ts` to use a dedicated `alarms/` subdirectory and implemented robust `isTauri()` runtime checks. Added `localStorage` fallback for browser-based development mode.
3. **Global Spacing Scale**: Defined a centralized spacing system (`--spacing-xs` to `--spacing-xl`) and `--border-color` in `index.css` to ensure layout consistency across all features.
4. **Clock UI Overhaul**: Redesigned `ClockPage` navigation header with 48px gaps between tabs, increased letter-spacing (0.2em), and a pulsing active indicator (border-bottom).
5. **AlarmForm Redesign**: Completely restructured the alarm creation form into logical sections (Time, Label, Schedule, Settings). Replaced confusing single-letter day labels with proper **SUN, MON, TUE, ...** abbreviations and fixed a vertical stacking overlap issue with a responsive horizontal selector.

## Architecture Rules (Non-Negotiable)

1. **Feature Isolation:** Code is grouped by feature (`src/features/habits`), not by type.
2. **No Cross-Feature Internals:** Import from `features/X/index.ts` only, never internals.
3. **Shared UI:** Generic components go in `src/shared/components/`.
4. **CSS Styling:** Vanilla CSS only. Use CSS variables from `index.css`. No Tailwind.
5. **Iconography:** `lucide-react`, outline style only. Use `LucideIcon` helper for dynamic names.
6. **Typography:** Use `.t-display`, `.t-label`, `.t-body`, `.t-meta`, `.t-data` classes. Never redeclare font sizes.
7. **Bracket Convention:** Page headers use `[ NAME ]` wrapping (Endfield aesthetic).

---

## File Map (Key Files)

```
src/
├── App.tsx                → RouterProvider entry
├── index.css              → Tokens, font-face, typography, globals
├── main.tsx               → ReactDOM render
├── app/
│   ├── Layout.tsx         → Grid layout + CommandPalette state + keyboard shortcuts
│   ├── Layout.css         → Grid: sidebar 200px, topbar 44px, content fills
│   └── routes.tsx         → React Router v6 with Layout wrapper
├── shared/
│   ├── components/
│   │   ├── Sidebar/       → NavLink routing, Lucide icons, Quick Stats
│   │   ├── Topbar/        → Search trigger, Tauri window controls
│   │   ├── CommandPalette/→ Fuzzy search pages/habits/todos, grouped results, action commands
│   │   ├── FlameIcon/     → 7-tier SVG streak flame (CSS-only animations)
│   │   ├── LevelBadge/    → 11-tier level badge (Lv0-Lv10)
│   │   ├── ConfettiParticles/ → Self-cleaning CSS particle burst
│   │   └── ProgressRing/  → Reusable SVG circular progress ring
│   ├── hooks/
│   │   ├── useKeyboardShortcuts.ts → Ctrl+K + H/T/A/S + N (new item) + Space (quick-complete)
│   │   └── useNotifications.ts    → 60s polling for nudges, strike warnings, weekly summary
│   ├── utils/
│   │   ├── dateUtils.ts   → getToday(), formatDate(), subtractDays(), isBeforeResetTime()
│   │   └── tauri.ts       → isTauri(), openExternalLink()
│   ├── types/
│   │   └── index.ts       → User, Settings, Aesthetics, Wallpapers
│   └── config/
│       └── firebase.ts    → Firebase init (placeholder keys)
│   ├── habits/
│   │   ├── components/
│   │   │   ├── HabitsPage.tsx     → Main habit management view (formerly DashboardPage)
│   │   │   ├── HabitCard/         → Grid card with hold-to-verify, metric bars, onClick detail
│   │   │   ├── HabitForm/         → 7-step creation wizard
│   │   │   ├── HabitDetail/       → Slide-out analytics: heatmap, sparklines, edit, archive/delete
│   │   │   ├── DailyNote/         → Auto-saving journal textarea
│   │   │   └── HabitGroupHeader/  → Collapsible group section header
│   │   ├── services/
│   │   │   ├── habitService.ts    → CRUD + archive + reorder
│   │   │   ├── logService.ts      → Daily logs + getLogRange() for analytics
│   │   │   └── groupService.ts    → Group CRUD (Firestore subcollection)
│   │   └── utils/                 → streakEngine, levelEngine, scheduleEngine
│   ├── todos/
│   │   ├── types.ts               → Todo, NumberedTodoConfig, StickyPosition
│   │   ├── services/
│   │   │   ├── todoService.ts     → CRUD + increment/complete numbered
│   │   │   └── deadlineChecker.ts → Missed-deadline strike enforcement
│   │   └── components/
│   │       ├── TodosPage.tsx      → Active, Upcoming, Completed sections
│   │       ├── TodoCard/          → Interactive card with hold-to-complete
│   │       └── TodoForm/          → 4-step creation wizard
│   ├── sticky-notes/
│   │   ├── components/
│   │   │   ├── StickyCanvas.tsx   → Transparent fullscreen overlay, click-through logic
│   │   │   ├── StickyNote.tsx     → Draggable sticky, hold-complete, double-hold
│   │   │   └── StickyNote.css     → Translucent dark bg, badges, animations
│   │   ├── hooks/
│   │   │   └── useStickyNotes.ts  → Real-time onSnapshot + local cache
│   │   └── services/
│   │       └── positionStore.ts   → localStorage + debounced Firestore sync
│   ├── clock/
│   │   ├── types.ts           → Alarm, Timer, StopwatchState
│   │   ├── services/
│   │   │   ├── alarmService.ts    → Local CRUD for alarms.json
│   │   │   ├── timerService.ts    → CRUD + start/pause/reset for timers.json
│   │   │   ├── stopwatchService.ts→ Persistence for stopwatch.json
│   │   │   ├── audioService.ts    → Local file playback via convertFileSrc
│   │   │   └── timerScheduler.ts  → Background-tick listener for notifications
│   │   └── components/
│   │       ├── ClockPage.tsx      → Tabbed shell: [ ALARM ] [ TIMER ] [ STOPWATCH ]
│   │       ├── AlarmList/         → Alarm cards with toggles
│   │       ├── AlarmForm/         → Wheel time picker, audio selector, snooze config
│   │       ├── AlarmPopup/        → Frameless overlay with auto-stop logic
│   │       ├── TimerPanel/        → Grid of 6 timers, shared audio toggle
│   │       ├── TimerCard/         → Circular progress ring, manual controls
│   │       └── StopwatchPanel/    → RAF ticker, lap tracking table
│   ├── analytics/components/AnalyticsPage.tsx
│   ├── settings/components/
│   │   ├── SettingsPage.tsx       → Config shell with GroupManager
│   │   ├── DesktopSection.tsx     → Environment-aware desktop/widget management
│   │   └── GroupManager/          → Group CRUD interface
│   ├── strikes/
│   │   ├── types.ts               → StrikeState, PunishmentChoice, MAX_STRIKES
│   │   ├── services/
│   │   │   ├── strikeService.ts    → getStrikes, addStrike, resetStrikes, isLockedOut
│   │   │   ├── punishmentService.ts → applyPunishment (difficulty/habit/todo)
│   │   │   └── gapProcessor.ts    → Startup gap detection + deadline checking
│   │   ├── hooks/
│   │   │   └── useStrikes.ts       → Real-time Firestore onSnapshot listener
│   │   └── components/
│   │       ├── LockoutOverlay.tsx  → Full-screen lockout (z-index 9999)
│   │       ├── PunishmentModal.tsx → 3-card punishment selection (z-index 10000)
│   │       └── StrikeWarningToast.tsx → Toast at 3/5 and 4/5 strikes
│   ├── freeze/
│   │   ├── types.ts               → FreezeState, FreezeReason, AUTO_FREEZE_THRESHOLD_DAYS
│   │   ├── services/
│   │   │   └── freezeService.ts    → activate, deactivate, checkAutoFreeze, isDateInFreezeRange
│   │   └── components/
│   │       ├── WelcomeBack.tsx     → Full-screen return screen (auto-freeze)
│   │       ├── WelcomeBack.css     → Warm blue design, frost pulse
│   │       ├── ManualFreezeToggle.tsx → Settings freeze toggle
│   │       └── ManualFreezeToggle.css → Toggle card styling
│   ├── widget/
│   │   ├── components/
│   │   │   ├── WidgetApp.tsx       → Standalone React tree, wallpaper bg, lockout overlay
│   │   │   ├── WidgetApp.css       → Transparent shell, dim overlay, frozen state
│   │   │   ├── PowerHub/
│   │   │   │   ├── PowerHub.tsx    → Live clock + SVG ring + stats row
│   │   │   │   └── PowerHub.css   → Compact vertical layout
│   │   │   └── HabitList/
│   │   │       ├── WidgetHabitList.tsx  → Regular + Limiter sections, completion sort
│   │   │       ├── WidgetHabitCard.tsx → 36px row, hold-to-verify, undo
│   │   │       └── WidgetHabitCard.css → Hold sweep, completed fade
│   │   ├── hooks/
│   │   │   └── useWidgetData.ts    → Real-time Firestore listeners for widget
│   │   └── services/
│   │       └── widgetPositionStore.ts → AppData position persistence
```

### Rust Backend (`src-tauri/src/`)
```
lib.rs          → Tauri builder with plugin registration + background-tick pacemaker
workerw.rs      → WorkerW embedding: find_workerw, embed_in_workerw, WS_EX_TOOLWINDOW
```

---

## Design Tokens (`src/index.css`)

### Colors
- `--bg-base`: `#08090a` · `--bg-surface`: `#111214` · `--bg-elevated`: `#1a1b1e` · `--bg-overlay`: `#222326`
- `--border-subtle`: `rgba(255,255,255,0.06)` · `--border-default`: `rgba(255,255,255,0.10)` · `--border-color`: `rgba(255,255,255,0.10)`
- `--text-primary`: `#e8e8e8` · `--text-secondary`: `#888` · `--text-muted`: `#555`
- `--accent`: `#5B8DEF` (user-chosen) · `--strike-red`: `#E8736C`

### Spacing
- `--spacing-xs`: `4px` · `--spacing-sm`: `8px` · `--spacing-md`: `16px` · `--spacing-lg`: `24px` · `--spacing-xl`: `32px`

### Typography
- `.t-display` 33px · `.t-label` 9px uppercase · `.t-body` 13px · `.t-meta` 9px uppercase · `.t-data` 11px tabular

---

## Development
- **Run dev:** `npm run tauri dev` (or `npx vite dev` for browser-only)
- **Build:** `npx vite build`
- Tauri v2 — all native features use Rust APIs, no Electron
