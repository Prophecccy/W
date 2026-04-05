# W — Extreme Build Todo List

> **How it works:** Tasks are split into **Batches**. Each batch is done by ONE model (Claude Opus 4.6 or Gemini 3.1). After a batch is complete, **STOP and wait** for the user to switch models. The `agent.md` file is the handoff doc.
>
> **Rule:** After completing your batch, update `agent.md` with everything you did, then STOP.

---

## BATCH 1 — Project Scaffolding (16 tasks)

- [x] 1. Run `npx create-tauri-app@latest` with React + TypeScript template in `W/`
- [x] 2. Verify project builds: `npm install` + `npm run tauri dev`
- [x] 3. Install core deps: `react-router-dom`, `framer-motion`, `lucide-react`
- [x] 4. Install Firebase deps: `firebase` (v10+)
- [x] 5. Copy `DepartureMono-Regular.woff2` and `.woff` to `src/assets/fonts/`
- [x] 6. Create `@font-face` declaration in `src/index.css` for Departure Mono
- [x] 7. Create CSS custom properties (design tokens) in `src/index.css`: `--bg-base`, `--bg-surface`, `--bg-elevated`, `--bg-overlay`, `--border-subtle`, `--border-default`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent`, `--strike-red`
- [x] 8. Create 5-tier typography classes: `.t-display`, `.t-label`, `.t-body`, `.t-meta`, `.t-data`
- [x] 9. Set global `* { box-sizing: border-box; margin: 0; padding: 0; }` and `body { font-family: 'Departure Mono'; background: var(--bg-base); color: var(--text-primary); }`
- [x] 10. Create feature-based folder structure: `src/features/{auth,habits,todos,strikes,analytics,settings,wallpaper,clock,widget,sticky-notes,freeze}/` — each with `components/`, `hooks/`, `services/`, `types.ts`, `index.ts`
- [x] 11. Create `src/shared/{components,hooks,utils,types,config}/` folder structure
- [x] 12. Create `src/app/App.tsx`, `src/app/routes.tsx`, `src/app/providers.tsx` shell files
- [x] 13. Create `src/shared/config/firebase.ts` — Firebase app init (placeholder config, no real keys yet)
- [x] 14. Create `src/shared/utils/dateUtils.ts` — stub with `getToday()`, `formatDate()`, `isBeforeResetTime()`
- [x] 15. Create `src/shared/types/index.ts` — shared TypeScript interfaces (`User`, `Settings`, `Aesthetics`)
- [x] 16. Create `agent.md` at project root with: tech stack, folder structure, design token reference, font setup, and "current state: scaffolding complete"

**✋ STOP — Wait for model switch**

---

## BATCH 2 — App Shell & Navigation (19 tasks)

- [x] 17. Create `src/app/Layout.tsx` — main layout wrapper with sidebar + topbar + content area (CSS Grid)
- [x] 18. Create `src/app/Layout.css` — inverted L-shape chrome: sidebar 200px fixed left, topbar 44px fixed top, content fills remaining
- [x] 19. Create `src/shared/components/Sidebar/Sidebar.tsx` — nav links with Lucide icons: Dashboard, Todos, Clock, Analytics, Settings
- [x] 20. Create `src/shared/components/Sidebar/Sidebar.css` — dark `--bg-surface` background, hover → `--bg-elevated`, active item accent border-left
- [x] 21. Add Quick Stats section to Sidebar bottom: 🔥 streak + ⚠️ strikes (hardcoded placeholders for now)
- [x] 22. Create `src/shared/components/Topbar/Topbar.tsx` — logo `[ W ]`, search icon (command palette trigger), window controls area
- [x] 23. Create `src/shared/components/Topbar/Topbar.css` — 44px height, `--bg-surface`, bottom border `--border-subtle`
- [x] 24. Create `src/app/routes.tsx` — React Router v6 setup with routes: `/` (Dashboard), `/todos`, `/clock`, `/analytics`, `/settings`
- [x] 25. Create placeholder page components: `src/features/habits/components/DashboardPage.tsx`, `src/features/todos/components/TodosPage.tsx`, `src/features/clock/components/ClockPage.tsx`, `src/features/analytics/components/AnalyticsPage.tsx`, `src/features/settings/components/SettingsPage.tsx`
- [x] 26. Each placeholder page: centered `[ PAGE NAME ]` in Display tier typography with bracket wrapping
- [x] 27. Wire `Layout.tsx` → `routes.tsx` → placeholder pages. Verify navigation works on click.
- [x] 28. Add active state styling to Sidebar: current route gets `--accent` left border + `--bg-elevated` background
- [x] 29. Create `src/shared/components/CommandPalette/CommandPalette.tsx` — floating modal, centered, search input, results list
- [x] 30. Create `src/shared/components/CommandPalette/CommandPalette.css` — `--bg-overlay` background, border-radius 8px, subtle shadow, `--border-default` border
- [x] 31. Add keyboard listener: `Ctrl+K` toggles CommandPalette visibility
- [x] 32. Implement fuzzy search over static list: page names ("Dashboard", "Todos", "Clock", "Analytics", "Settings")
- [x] 33. Add global keyboard shortcuts: `H` → Dashboard, `T` → Todos, `A` → Analytics, `S` → Settings (only when not typing in an input)
- [x] 34. Add Tauri window controls to Topbar: minimize, maximize, close (using `@tauri-apps/api/window`)
- [x] 35. Update `agent.md`: document Layout system, routing, sidebar anatomy, command palette, keyboard shortcuts

**✋ STOP — Wait for model switch**

---

## BATCH 3 — Authentication & Onboarding (14 tasks)

- [x] 36. Set up Firebase project in console, get config keys. Update `src/shared/config/firebase.ts` with real config
- [x] 37. Enable Google Sign-In in Firebase Auth console
- [x] 38. Create `src/features/auth/services/authService.ts` — `signInWithGoogle()`, `signOut()`, `onAuthStateChanged()` listener
- [x] 39. Create `src/features/auth/hooks/useAuth.ts` — React hook wrapping auth state: `{ user, loading, signIn, signOut }`
- [x] 40. Create `src/features/auth/context.tsx` — AuthContext provider wrapping the app
- [x] 41. Create `src/features/auth/components/LoginPage.tsx` — centered `[ W ]` logo, `[ SIGN IN WITH GOOGLE ]` button, dark `--bg-base` background
- [x] 42. Create `src/features/auth/components/LoginPage.css` — minimal industrial styling, bracket-wrapped button
- [x] 43. Create `src/features/auth/components/AuthGuard.tsx` — wrapper that redirects to LoginPage if not authenticated
- [x] 44. Wire AuthGuard into `App.tsx` — wrap all routes so app is inaccessible without sign-in
- [x] 45. Create `src/features/auth/services/userService.ts` — `createUserDoc()` (creates Firestore user doc on first sign-in), `getUserDoc()`, `updateUserDoc()`
- [x] 46. Create `src/features/auth/components/OnboardingPage.tsx` — one-page setup: accent color picker, timezone dropdown, daily reset time picker
- [x] 47. Create `src/features/auth/components/OnboardingPage.css` — clean form layout, bracket-wrapped section headers
- [x] 48. Add first-login detection: if `users/{uid}` doc doesn't exist → show OnboardingPage → create user doc → redirect to Dashboard
- [x] 49. Update `agent.md`: document auth flow, user doc schema, onboarding flow

**✋ STOP — Wait for model switch**

---

## BATCH 4 — Habit Data Layer & Types (21 tasks)

- [x] 50. Create `src/features/habits/types.ts` — full `Habit` interface matching v1 schema: `title`, `description`, `icon`, `color`, `period`, `type`, `frequency`, `metric`, `duration`, `level`, `totalCompletions`, `levelProgress`, `currentStreak`, `longestStreak`, `lastCompletedDate`, `isActive`, `archivedAt`, `order`, `group`
- [x] 51. Create `HabitLog` interface in same file: `timestamp`, `habits` map (habitId → `{ completed, value, target, completions[], timerSeconds, note }`)
- [x] 52. Create `HabitGroup` type: `{ id, name, order }`
- [x] 53. Create `src/features/habits/services/habitService.ts` — `createHabit(habit)`: writes to `users/{uid}/habits/{id}`
- [x] 54. Add `getHabits()`: query all active habits for user, ordered by `order` field
- [x] 55. Add `getHabitById(habitId)`: single doc read
- [x] 56. Add `updateHabit(habitId, updates)`: partial update (respects edit restrictions — name, description, icon only)
- [x] 57. Add `archiveHabit(habitId)`: sets `archivedAt` timestamp, `isActive = false`
- [x] 58. Add `deleteHabit(habitId)`: hard delete from Firestore (only after compensation verified)
- [x] 59. Add `reorderHabits(habitIds[])`: batch update `order` field for all habits
- [x] 60. Create `src/features/habits/services/logService.ts` — `getTodayLog()`: reads `logs/{today}`, creates empty doc if missing
- [x] 61. Add `completeHabit(habitId, value)`: updates today's log `habits[habitId]` with completion data + pushes to `completions[]` array
- [x] 62. Add `uncompleteHabit(habitId)`: removes completion from today's log (for undo)
- [x] 63. Add `getLogRange(startDate, endDate)`: query logs subcollection for analytics
- [x] 64. Create `src/features/habits/utils/streakEngine.ts` — `calculateStreak(habit, logs[])`: computes current streak based on period type (daily/weekly/monthly/interval)
- [x] 65. Add `calculateGlobalStreak(habits[], logs[])`: consecutive days where ALL scheduled habits were completed
- [x] 66. Create `src/features/habits/utils/levelEngine.ts` — `calculateLevel(totalCompletions)`: returns `{ level, progress, nextThreshold }` based on doubling progression table
- [x] 67. Add `getLevelThresholds()`: returns the full 0-10 level table
- [x] 68. Create `src/features/habits/utils/scheduleEngine.ts` — `isHabitScheduledToday(habit, today)`: determines if a habit is due today based on period, frequency, daysOfWeek, interval
- [x] 69. Add `getNextDueDate(habit)`: for interval habits, calculates next occurrence
- [x] 70. Update `agent.md`: document habit schema, service API, streak/level/schedule engines

**✋ STOP — Wait for model switch**

---

## BATCH 5 — Habit UI Components (23 tasks)

- [x] 71. Create `src/features/habits/components/HabitCard/HabitCard.tsx` — displays habit info: icon, title, progress, level badge, streak, type badges
- [x] 72. Create `src/features/habits/components/HabitCard/HabitCard.css` — dark card (`--bg-surface`), `--border-default` outline, 4px radius, accent-colored icon, bracket-wrapped badges `[ DAILY ]` `[ METRIC ]`
- [x] 73. Implement hold-to-verify on HabitCard: 500ms press → fill animation left→right → checkmark + complete
- [x] 74. Add undo toast: on completion, show 8-second `[ UNDO ]` toast at bottom of screen
- [x] 75. Implement level visual progression on HabitCard: Lv0 = greyed, Lv1 = normal, Lv2+ = cumulative subtle effects (border, glow, shimmer per level)
- [x] 76. Implement per-habit streak display: small 🔥 + number on right side of card
- [x] 77. Add metric progress bar to HabitCard: accent-colored fill on dark track, shows `12/30 pages`
- [x] 78. Add limiter display variation: red-coded card, shows `1/3 cups` with `--strike-red` accent
- [x] 79. Create `src/features/habits/components/HabitForm/HabitForm.tsx` — multi-step creation: Period → Type → Config → Duration → Icon/Color → Group
- [x] 80. Create `src/features/habits/components/HabitForm/HabitForm.css` — step-by-step form with bracket headers, stepper inputs
- [x] 81. Step 1: Period selector (Daily, Weekly, Monthly, Interval) — radio-style cards
- [x] 82. Step 2: Type selector (Standard, Metric, Limiter) — radio-style cards with descriptions
- [x] 83. Step 3: Dynamic config — frequency stepper, metric unit picker (presets + custom), target value input, timer toggle
- [x] 84. Step 4: Duration (Continuing ∞ / Endpoint with date pickers or stepper)
- [x] 85. Step 5: Icon picker (65-icon grid from Lucide, searchable) + color picker (full picker)
- [x] 86. Step 6: Group selector (dropdown of existing groups + "New Group" option)
- [x] 87. Create `src/shared/components/IconPicker/IconPicker.tsx` — grid of 65 Lucide icons, search filter, click to select
- [x] 88. Create `src/shared/components/ColorPicker/ColorPicker.tsx` — full HSL color picker with preview swatch
- [x] 89. Create `src/features/habits/components/DashboardPage.tsx` — full dashboard: habit grid + daily note editor at bottom
- [x] 90. Implement 3 layout presets: Default (priority-sorted), Group by Categories, Custom (drag-and-drop)
- [x] 91. Implement Limiter section: always separate at bottom, above completed
- [x] 92. Implement completed habits section: collapsible, faded styling
- [x] 93. Update `agent.md`: document HabitCard anatomy, HabitForm steps, dashboard layouts

**✋ STOP — Wait for model switch**

---

## BATCH 6 — Habit Detail, Daily Note & Grouping (17 tasks)

- [x] 94. Create `src/features/habits/components/HabitDetail/HabitDetail.tsx` — slide-out or modal showing full habit analytics
- [x] 95. Create `src/features/habits/components/HabitDetail/HabitDetail.css` — dark panel, bracket headers
- [x] 96. HabitDetail contents: completion calendar heatmap, completion rate (all-time/month/week toggle), streak stats, level + progress bar
- [x] 97. For metric habits: add value progression line chart
- [x] 98. For limiter habits: add trend line with max threshold
- [x] 99. Add edit section (restricted): name, description, icon editable. Period/type/frequency/target greyed out with lock icon
- [x] 100. Add archive button: `[ ARCHIVE ]` — soft-hides habit, no compensation
- [x] 101. Add delete flow: `[ DELETE ]` → modal "To delete, you must create a new habit or todo" → redirects to HabitForm or TodoForm → on creation, deletes the original
- [x] 102. Create `src/features/habits/components/DailyNote/DailyNote.tsx` — full-width textarea at dashboard bottom
- [x] 103. Create `src/features/habits/components/DailyNote/DailyNote.css` — monospace Departure Mono, `--bg-surface`, subtle border, placeholder "Write about today..."
- [x] 104. DailyNote auto-saves to `logs/{today}.notes` on debounced input (500ms)
- [x] 105. DailyNote shows character count: `0 / 5,000`
- [x] 106. Create `src/features/habits/components/HabitGroupHeader.tsx` — collapsible group header: `[ MORNING ]` with chevron
- [x] 107. Implement group rendering: habits sorted by group, ungrouped habits at top
- [x] 108. Create `src/features/settings/components/GroupManager.tsx` — CRUD for habit groups (add, rename, delete, reorder)
- [x] 109. Wire DashboardPage: HabitGroupHeaders → HabitCards → LimiterSection → CompletedSection → DailyNote
- [x] 110. Update `agent.md`: document HabitDetail, daily note, grouping system

**✋ STOP — Wait for model switch**

---

## BATCH 7 — Strike System & Lockout (18 tasks)

- [x] 111. Create `src/features/strikes/types.ts` — `StrikeState`, `StrikeHistoryEntry`, `PunishmentChoice`
- [x] 112. Create `src/features/strikes/services/strikeService.ts` — `getStrikes()`: reads `user.strikes` from user doc
- [x] 113. Add `addStrike(habitId, reason)`: increments `strikes.current`, pushes to `strikes.history[]`, updates `lastStrikeDate`
- [x] 114. Add `resetStrikes()`: sets `strikes.current = 0` after punishment
- [x] 115. Add `isLockedOut()`: returns `strikes.current >= 5`
- [x] 116. Create `src/features/strikes/services/punishmentService.ts` — `applyPunishment(choice)`: handles each punishment type
- [x] 117. Punishment: "Increase difficulty" — updates `habit.metric.targetValue` by +1/3 of `originalTarget`
- [x] 118. Punishment: "Add new habit" — redirects to HabitForm, on creation → `resetStrikes()`
- [x] 119. Punishment: "Add new todo" — redirects to TodoForm, on creation → `resetStrikes()`
- [x] 120. Create `src/features/strikes/components/LockoutOverlay.tsx` — full-screen red overlay blocking all interaction: `[ SYSTEM LOCKED ]`, `[ RESOLVE ]` button
- [x] 121. Create `src/features/strikes/components/LockoutOverlay.css` — red transparent overlay, centered text, Departure Mono Display tier
- [x] 122. Create `src/features/strikes/components/PunishmentModal.tsx` — 3 options as selectable cards, `[ CONFIRM ]` button
- [x] 123. Create `src/features/strikes/components/PunishmentModal.css` — dark modal, bracket-wrapped option cards
- [x] 124. Create `src/features/strikes/hooks/useStrikes.ts` — real-time Firestore listener on `user.strikes`, exposes `{ strikes, isLocked, addStrike, resolve }`
- [x] 125. Wire LockoutOverlay into `App.tsx`: renders above everything when `isLocked === true`
- [x] 126. Create `src/features/strikes/components/StrikeWarningToast.tsx` — toast at 3/5 and 4/5 strikes: `⚠️ X/5 STRIKES`
- [x] 127. Add strike counter animation in Sidebar Quick Stats: red pulse on increment
- [x] 128. Update `agent.md`: document strike state machine, lockout flow, punishment options

**✋ STOP — Wait for model switch**

---

## BATCH 8 — Gap Processor & Freeze System (18 tasks)

- [x] 129. Create `src/features/strikes/services/gapProcessor.ts` — `processGap(lastActiveDate, today, habits[], logs[])`: main entry
- [x] 130. Implement day-by-day loop: for each day from `lastActiveDate + 1` to `yesterday`
- [x] 131. For each day in loop: check each active habit via `isHabitScheduledToday()` → if scheduled and not in log → mark as missed
- [x] 132. For each miss: call `addStrike()` with habit ID and reason
- [x] 133. Interval strike guard: track `lastStrikeDate` per interval habit — only ONE strike per missed due date
- [x] 134. After loop: update `user.lastActiveDate = today`
- [x] 135. Integrate gap processor into auth flow: after sign-in → run `processGap()` before showing dashboard
- [x] 136. Create `src/features/freeze/types.ts` — `FreezeState`: `{ active, startDate, reason, lastInteractionDate }`
- [x] 137. Create `src/features/freeze/services/freezeService.ts` — `activateFreeze(reason)`: sets `freeze.active = true`, stores start date
- [x] 138. Add `deactivateFreeze()`: sets `freeze.active = false`, clears dates
- [x] 139. Add `checkAutoFreeze(lastInteractionDate, today)`: if gap ≥ 3 days → auto-activate + retroactively freeze day 1 & 2
- [x] 140. Add `isCurrentlyFrozen()`: reads freeze state
- [x] 141. Modify gap processor: before processing any day, check if freeze was active → skip penalties for frozen days
- [x] 142. Create `src/features/freeze/components/WelcomeBack.tsx` — gentle return screen: frozen date range display, `[ RESUME ALL HABITS ]` button, option to adjust range
- [x] 143. Create `src/features/freeze/components/WelcomeBack.css` — warm, non-threatening design (no red), bracket headers
- [x] 144. Create `src/features/freeze/components/ManualFreezeToggle.tsx` — toggle in Settings to manually activate/deactivate freeze
- [x] 145. Integrate freeze check into app startup: if auto-freeze triggers → show WelcomeBack before dashboard
- [x] 146. Update `agent.md`: document gap processor logic, freeze system, auto-freeze detection, welcome back flow

**✋ STOP — Wait for model switch**

---

## BATCH 9 — Todo System (20 tasks)

- [x] 147. Create `src/features/todos/types.ts` — `Todo` interface matching v2 schema: `title`, `description`, `type`, `status`, `color`, `numbered`, `deadline`, `future`, `stickyPosition`, `order`
- [x] 148. Create `src/features/todos/services/todoService.ts` — `createTodo(todo)`: writes to `users/{uid}/todos/{id}`
- [x] 149. Add `getTodos()`: query all non-done todos, ordered by `order`
- [x] 150. Add `getCompletedTodos()`: query `status === "done"`, limit 50, ordered by `completedAt` desc
- [x] 151. Add `updateTodo(todoId, updates)`: partial update (title, color, deadline, future editable; type locked)
- [x] 152. Add `deleteTodo(todoId)`: hard delete, no compensation
- [x] 153. Add `completeTodo(todoId)`: sets `status = "done"`, `completedAt = serverTimestamp()`
- [x] 154. Add `incrementNumberedTodo(todoId)`: increments `numbered.current` by 1, caps at `numbered.target`, auto-completes if target reached
- [x] 155. Add `completeNumberedTodoFull(todoId)`: sets `numbered.current = numbered.target`, marks done
- [x] 156. Create `src/features/todos/services/deadlineChecker.ts` — `checkDeadlines(todos[], resetTime)`: for each deadline todo past due → add strike
- [x] 157. Integrate deadline checker into gap processor and daily reset time trigger
- [x] 158. Create `src/features/todos/components/TodoForm/TodoForm.tsx` — create form: title, type (standard/numbered), color picker, optional deadline toggle, optional future date, "Show on desktop" toggle
- [x] 159. Create `src/features/todos/components/TodoForm/TodoForm.css` — bracket headers, inline toggles, clean layout
- [x] 160. Create `src/features/todos/components/TodoCard/TodoCard.tsx` — list item: icon + title + type badges + deadline countdown + numbered progress
- [x] 161. Create `src/features/todos/components/TodoCard/TodoCard.css` — compact list item, accent-colored left border
- [x] 162. Create `src/features/todos/components/TodosPage.tsx` — full page: create button, active todos list, upcoming section (greyed future + interval habits), completed section (collapsible)
- [x] 163. Implement Upcoming section: shows future todos (greyed) + interval habits waiting for next due date
- [x] 164. Implement Completed section: collapsible, faded, auto-purge indicator
- [x] 165. Add hold-to-complete interaction on TodoCard (same as habit cards, 500ms)
- [x] 166. Update `agent.md`: document todo schema, service API, deadline checker, TodosPage layout

**✋ STOP — Wait for model switch**

---

## BATCH 10 — Desktop Sticky Notes (15 tasks)

- [x] 167. Create Tauri config for sticky note overlay window: transparent, frameless, fullscreen, `WorkerW` embedded, `decorations: false`, `transparent: true`
- [x] 168. Create `src/features/sticky-notes/components/StickyCanvas.tsx` — full-screen transparent container rendering all sticky notes as positioned divs
- [x] 169. Create `src/features/sticky-notes/components/StickyNote.tsx` — single sticky note: rectangle, adaptive width based on title length, outline color, Departure Mono 13px
- [x] 170. Create `src/features/sticky-notes/components/StickyNote.css` — dark translucent bg `rgba(17,18,20,0.85)`, 1px outline, deadline badge (clock icon + countdown), numbered badge (count corner)
- [x] 171. Implement drag-and-drop on StickyNote: mouse down → move → mouse up, constrained to screen bounds
- [x] 172. Create `src/features/sticky-notes/components/StickyNoteStore.ts` — save/load positions from `{appDataDir}/sticky_notes.json` + sync to Firestore `stickyPosition`
- [x] 173. Implement debounced position save: only write to Firestore 1 second after drag ends (not on every pixel)
- [x] 174. Implement click-and-hold on sticky: standard task → complete + animate away. Numbered task → increment +1
- [x] 175. Implement double-click-and-hold: numbered task → mark fully complete
- [x] 176. Implement completion animation: fade + scale down + drift off screen (Framer Motion)
- [x] 177. Create `src/features/sticky-notes/hooks/useStickyNotes.ts` — real-time listener on `users/{uid}/todos` where `status !== "done"`, maps to sticky note positions
- [x] 178. Wire StickyCanvas to listen for new/deleted/completed todos → add/remove sticky notes
- [x] 179. On app startup: load positions from local JSON cache first (fast), then sync from Firestore
- [x] 180. Test: create 15 todos → verify 15 sticky notes render without performance issues
- [x] 181. Update `agent.md`: document sticky note architecture, position persistence, interaction model

**✋ STOP — Wait for model switch**

---

## BATCH 11 — Clock: Alarms (19 tasks)

- [x] 182. Create `src/features/clock/types.ts` — `Alarm` interface: `id`, `time`, `label`, `audioPath`, `daysOfWeek[]`, `repeatDaily`, `snoozeCount`, `snoozeGapMinutes`, `wakeUpMessage`, `enabled`
- [x] 183. Add `Timer` interface: `id`, `name`, `durationSeconds`, `remainingSeconds`, `status`, `audioPath`
- [x] 184. Add `StopwatchState` interface: `running`, `elapsedMs`, `laps[]`
- [x] 185. Create `src/features/clock/components/ClockPage.tsx` — tabbed layout: `[ ALARM ]` `[ TIMER ]` `[ STOPWATCH ]`
- [x] 186. Create `src/features/clock/components/ClockPage.css` — bracket-wrapped tab headers, clean switching animation
- [x] 187. Create `src/features/clock/services/alarmService.ts` — CRUD for alarms stored in `{appDataDir}/alarms.json` (local only, max 6)
- [x] 188. Add `createAlarm(alarm)`: validates max 6, saves to local JSON
- [x] 189. Add `updateAlarm(id, updates)`, `deleteAlarm(id)`, `toggleAlarm(id)`
- [x] 190. Create `src/features/clock/components/AlarmForm/AlarmForm.tsx` — time picker (scrollable wheel), day selector, repeat toggle, audio file picker, snooze config (count stepper + gap stepper), wake-up message input
- [x] 191. Create smooth 60fps time picker wheel: CSS scroll-snap + touch/mouse drag
- [x] 192. Create audio file picker: native file dialog (Tauri `dialog.open()`), filter by `.mp3,.wav,.ogg,.flac`, display selected filename, show supported formats list
- [x] 193. Create `src/features/clock/components/AlarmList/AlarmList.tsx` — list of alarm cards: time, label, days, toggle switch
- [x] 194. Create Tauri config for Alarm Popup window: always-on-top, centered, non-closeable, frameless
- [x] 195. Create `src/features/clock/components/AlarmPopup/AlarmPopup.tsx` — current time `[ 06:30 AM ]`, wake-up message, `[ SNOOZE ]` + `[ STOP ]` buttons
- [x] 196. Create `src/features/clock/components/AlarmPopup/AlarmPopup.css` — dark `--bg-surface`, red pulse border animation, accent STOP button
- [x] 197. Create `src/features/clock/services/audioService.ts` — `playAudio(filePath)`, `stopAudio()`, `loopAudio()` via Tauri audio APIs
- [x] 198. Implement alarm trigger logic: Tauri backend scheduler checks alarm times, spawns popup window + starts audio
- [x] 199. Implement 5-minute auto-stop: audio stops after 300s continuous loop, popup stays
- [x] 200. Update `agent.md`: document alarm system, audio service, popup window, trigger logic

**✋ STOP — Wait for model switch**

---

## BATCH 12 — Clock: Timer & Stopwatch (16 tasks)

- [x] 201. Create `src/features/clock/services/timerService.ts` — manage up to 6 concurrent timers in local state
- [x] 202. Add `createTimer(name, durationSec, audioPath?)`, `startTimer(id)`, `pauseTimer(id)`, `resumeTimer(id)`, `resetTimer(id)`, `deleteTimer(id)`
- [x] 203. Implement timer countdown logic: `setInterval` with 1s tick, updates `remainingSeconds`
- [x] 204. On timer finish: trigger native Windows notification via Tauri notification API + play audio if set
- [x] 205. If no audio set on timer: silent visual notification only
- [x] 206. Create `src/features/clock/components/TimerPanel/TimerPanel.tsx` — create timer form (name input, time stepper, audio picker) + list of active/inactive timers
- [x] 207. Create `src/features/clock/components/TimerCard/TimerCard.tsx` — circular progress ring, timer name, remaining time, start/pause/reset buttons
- [x] 208. Create `src/features/clock/components/TimerCard/TimerCard.css` — accent-colored progress ring, bracket-wrapped buttons
- [x] 209. Create `src/features/clock/services/stopwatchService.ts` — `start()`, `pause()`, `resume()`, `reset()`, `addLap()`, `getLaps()`
- [x] 210. Implement stopwatch logic: `requestAnimationFrame` for smooth elapsed time display, persists in Tauri backend on minimize
- [x] 211. Create `src/features/clock/components/StopwatchPanel/StopwatchPanel.tsx` — large time display (Display tier), start/pause/reset/lap buttons, laps table
- [x] 212. Create `src/features/clock/components/StopwatchPanel/StopwatchPanel.css` — large monospace numbers, clean lap table, bracket buttons
- [x] 213. Laps table columns: Lap #, Lap Time, Total Time — sorted newest first
- [x] 214. Timer shared audio option: in timer creation, toggle "Use same audio for all timers"
- [x] 215. Stopwatch confirmation: no audio, no notification — display only
- [x] 216. Update `agent.md`: document timer service, stopwatch service, notification behavior

**✋ STOP — Wait for model switch**

---

## BATCH 13 — Widget Window & WorkerW (22 tasks)

- [x] 217. Create Tauri Rust plugin: `src-tauri/src/workerw.rs` — find `WorkerW` via `FindWindowEx`, embed window via `SetParent`
- [x] 218. Implement `WM_WINDOWPOSCHANGING` hook: force `HWND_BOTTOM` on any Z-order change attempt
- [x] 219. Set `WS_EX_TOOLWINDOW` extended style: widget never in alt-tab or taskbar
- [x] 220. Create Tauri config for widget window: frameless, transparent background, resizable (min 300×400, max 600×900, default 380×520)
- [x] 221. Create widget entry point: `src/features/widget/components/WidgetApp.tsx` — separate React tree for widget window
- [x] 222. Create `src/features/widget/components/PowerHub/PowerHub.tsx` — digital clock, progress ring, streak, strikes, weekly activity
- [x] 223. Create `src/features/widget/components/PowerHub/PowerHub.css` — compact layout, accent progress ring, Display tier clock
- [x] 224. Digital clock: live updating, Departure Mono Display tier, `[ HH:MM ]` format
- [x] 225. Progress ring: SVG circle, accent-colored fill arc, center text "5/8"
- [x] 226. Quick stats row: 🔥 streak + ⚠️ strikes + 📈 weekly count — Data tier typography
- [x] 227. Create `src/features/widget/components/HabitList/WidgetHabitList.tsx` — compact list of today's habits with hold-to-verify
- [x] 228. Create `src/features/widget/components/HabitList/WidgetHabitCard.tsx` — minimal: icon + title + progress/status + per-habit streak
- [x] 229. Create `src/features/widget/components/HabitList/WidgetHabitCard.css` — condensed, single-line per habit
- [x] 230. Implement hold-to-verify in widget: same 500ms fill animation, 8s undo
- [x] 231. Implement Limiter section in widget: `[ LIMITERS ]` header, separate from positive habits
- [x] 232. Add completed habits: faded styling, auto-filtered to bottom
- [x] 233. Create `src/features/widget/hooks/useWidgetData.ts` — real-time Firestore listeners: habits, today's log, user strikes
- [x] 234. Implement lockout overlay on widget: when `strikes >= 5` → red transparent overlay, `[ LOCKED — OPEN APP ]`
- [x] 235. Implement freeze indicator: when frozen → `⏸ FROZEN` replaces streak display, muted colors
- [x] 236. Implement wallpaper background: load wallpaper URL from `user.wallpapers.widget`, dim overlay based on `aesthetics.widget.dimIntensity`
- [x] 237. Widget position persistence: save window position to `{appDataDir}/widget_position.json` on move, restore on startup
- [x] 238. Update `agent.md`: document WorkerW embedding, widget architecture, window management

**✋ STOP — Wait for model switch**

---

## BATCH 14 — Analytics Dashboard (20 tasks)

- [x] 239. Create `src/features/analytics/types.ts` — `MonthlySummary`, `WeeklySummary`, `InsightCard` interfaces
- [x] 240. Create `src/features/analytics/services/analyticsService.ts` — `getMonthlySummary(month)`, `getWeeklySummary(week)`, `generateMonthlySummary()`, `generateWeeklySummary()`
- [x] 241. Add `getCompletionRate(habitId?, period?)`: calculates done/scheduled percentage
- [x] 242. Add `getBestWorstDays()`: averages completions grouped by day of week
- [x] 243. Add `getStreakProximity(habit)`: `longestStreak - currentStreak`
- [x] 244. Add `getMostConsistent()`: habit with highest all-time completion rate
- [x] 245. Add `getMostImproved()`: biggest month-over-month completion rate increase
- [x] 246. Create `src/features/analytics/components/AnalyticsPage.tsx` — 3-tier layout: Smart Insights cards → Overall Dashboard → Per-Habit Deep Dive
- [x] 247. Create Smart Insights card row: horizontally scrollable cards (best day, worst day, streak proximity, most consistent)
- [x] 248. Create `src/features/analytics/components/ActivityHeatmap.tsx` — GitHub-style grid, green intensity = completion %
- [x] 249. Create `src/features/analytics/components/ActivityHeatmap.css` — grid of small squares, tooltip on hover showing date + percentage
- [x] 250. Create completion rate widget: large percentage + trend arrow (up/down vs last period)
- [x] 251. Create weekly comparison bar chart: this week vs last week
- [x] 252. Create monthly comparison line chart: overlay current vs previous month
- [x] 253. Create strike history timeline: markers on a horizontal line with dates
- [x] 254. Create per-habit deep dive panel: click any habit in overview → shows completion calendar, streak stats, time-of-day pattern, value progression
- [x] 255. Create time-of-day bar chart: hourly distribution of completions (from `completions[].timestamp`)
- [x] 256. Create daily note review in analytics: calendar showing which days have notes (filled dot) vs empty (hollow dot), click to read
- [x] 257. Create consistency score widget: weighted 0-100 score factoring streaks, strikes, completion rate
- [x] 258. Update `agent.md`: document analytics tiers, chart types, insight calculations

**✋ STOP — Wait for model switch**

---

## BATCH 15 — Settings & System Features (22 tasks)

- [x] 259. Create `src/features/settings/components/SettingsPage.tsx` — sectioned layout: Account, Appearance, Schedule, Notifications, Data, Groups
- [x] 260. Create `src/features/settings/components/SettingsPage.css` — bracket section headers, clean form inputs
- [x] 261. Account section: user email, sign-out button, profile photo (from Google)
- [x] 262. Appearance section: accent color picker (full HSL picker), completion sound toggle
- [x] 263. Schedule section: daily reset time picker, weekly reset day selector, timezone dropdown
- [x] 264. Notifications section: toggles for Evening Nudge, Strike Warnings, Lockout Alert, Weekly Summary, Master Switch
- [x] 265. Create `src/features/settings/components/UndoHistory/UndoHistory.tsx` — timeline of recent actions, grouped by day
- [x] 266. Create `src/features/settings/services/undoService.ts` — `logAction(type, description, data)`, `getHistory(days)`, `undoAction(actionId)`
- [x] 267. Action types tracked: habit_complete, habit_uncomplete, todo_create, todo_delete, todo_complete, strike_added
- [x] 268. Implement undo logic: each action stores the reverse operation data, `undoAction()` executes it
- [x] 269. UndoHistory UI: `[ TODAY ]` header, each entry = icon + description + timestamp + `[ UNDO ]` button
- [x] 270. Rolling 7-day retention: auto-purge entries older than 7 days
- [x] 271. Create `src/features/settings/services/backupService.ts` — `createBackup()`: exports all Firestore data as JSON to `{appDataDir}/backups/backup_{date}.json`
- [x] 272. Implement weekly auto-backup: Tauri schedule, runs silently
- [x] 273. Rolling 4 backups: on new backup, delete oldest if count > 4
- [x] 274. Add manual backup button in Settings: `[ CREATE BACKUP NOW ]`
- [x] 275. Create `src/features/settings/services/exportService.ts` — `exportJSON()`, `exportCSV()`: download all logs, habits, todos
- [x] 276. Add Data section in Settings: `[ EXPORT JSON ]`, `[ EXPORT CSV ]`, `[ BACKUP NOW ]`, last backup date display
- [x] 277. Create `src/features/settings/components/GroupManager.tsx` — list of habit groups with add/rename/delete/reorder
- [x] 278. Implement freeze toggle in Settings: `[ ACTIVATE FREEZE ]` / `[ END FREEZE ]` with date display
- [x] 279. Add completion sound: bundle a small built-in `.wav` tick sound in `src/assets/sounds/complete.wav`, play via `audioService` on habit completion
- [x] 280. Update `agent.md`: document settings sections, undo system, backup service, export service

**✋ STOP — Wait for model switch**

---

## BATCH 16 — Wallpaper & Notifications (13 tasks)

- [x] 281. Create `src/features/wallpaper/services/wallpaperService.ts` — `uploadWallpaper(slot, file)`: uploads to Cloud Storage `users/{uid}/wallpapers/{slot}.webp`, updates user doc
- [x] 282. Add `getWallpaper(slot)`: returns download URL
- [x] 283. Add `removeWallpaper(slot)`: deletes from storage, clears user doc field
- [x] 284. Create `src/features/wallpaper/components/WallpaperPicker.tsx` — in Settings, 3 slots (widget, mobile, desktop), upload button, preview, remove
- [x] 285. Implement wallpaper display on main app: if set → shows as background with dim overlay; if not → solid `--bg-base`
- [x] 286. Create `src/shared/services/notificationService.ts` — wrapper around Tauri notification API: `sendNotification(title, body, icon?)`
- [x] 287. Implement Evening Nudge: schedule notification 2 hours before `dailyResetTime`, only fires if unfinished habits remain
- [x] 288. Implement Strike Warning: triggers at 3/5 and 4/5 strikes
- [x] 289. Implement Lockout Alert: fires once when `strikes.current >= 5`
- [x] 290. Implement Weekly Summary notification: fires after weekly reset with completion stats
- [x] 291. All notifications respect user toggles from Settings
- [x] 292. Create `src/shared/components/Toast/Toast.tsx` — in-app toast for non-critical feedback (undo, completion confirmations)
- [x] 293. Update `agent.md`: document wallpaper system, notification service, toast system

**✋ STOP — Wait for model switch**

---

## BATCH 17 — Streak Flame Evolution & Level Visuals (12 tasks)

- [x] 294. Create `src/shared/components/FlameIcon/FlameIcon.tsx` — SVG flame that visually evolves based on streak tier
- [x] 295. Implement 7 flame tiers: 1–6 (simple), 7–29 (flicker), 30–59 (double-layer), 60–99 (glow+particles), 100–199 (golden aura), 200–364 (ember trail), 365+ (peak)
- [x] 296. Each tier uses CSS animations: flicker = `@keyframes`, glow = `box-shadow` pulse, particles = pseudo-elements, ember = gradient trail
- [x] 297. Integrate FlameIcon into: HabitCard (per-habit streak), Sidebar Quick Stats (global streak), Widget PowerHub, Analytics
- [x] 298. Create `src/shared/components/LevelBadge/LevelBadge.tsx` — visual badge showing `Lv.X` with level-appropriate styling
- [x] 299. Implement 11 level visual tiers on HabitCard: Nil (greyed), Lv1 (normal), Lv2 (border), Lv3 (bolder icon), Lv4 (faint glow), Lv5 (more glow), Lv6 (shimmer border), Lv7 (icon highlight), Lv8 (gradient bg), Lv9 (premium border), Lv10 (all effects peak)
- [x] 300. All level effects are CSS-only: `box-shadow`, `border`, `filter`, `background-image`, `opacity` — no JS animation loops
- [x] 301. Create `src/shared/components/ProgressRing/ProgressRing.tsx` — reusable SVG progress ring (used in widget, analytics, timer)
- [x] 302. Create `src/shared/components/ConfettiParticles/ConfettiParticles.tsx` — small particle burst on habit completion (CSS `@keyframes`, auto-cleans up)
- [x] 303. Add micro-interactions: page crossfade (150ms), sidebar hover brighten, level-up card pulse, streak break shake + red flash, strike red pulse
- [x] 304. All animations GPU-composited: only `transform`, `opacity`, `box-shadow` — no `width`, `height`, `top`, `left` animations
- [x] 305. Update `agent.md`: document flame tiers, level visuals, animation principles

**✋ STOP — Wait for model switch**

---

## BATCH 18 — Final Integration & QA (15 tasks)

- [x] 306. Wire command palette to search habits and todos (not just pages): fuzzy match habit names, todo titles
- [x] 307. Add command palette actions: "Complete [habit]", "Create New Habit", "Create New Todo"
- [x] 308. Ensure all keyboard shortcuts work and don't fire when typing in inputs
- [x] 309. Add `Space` key: quick-complete currently focused/selected habit card
- [x] 310. Add `N` key: context-dependent, opens HabitForm on Dashboard, TodoForm on Todos page
- [x] 311. Test full auth flow: sign in → onboarding (first time) → dashboard
- [x] 312. Test habit lifecycle: create → track → complete → streak builds → level up → archive → delete (with compensation)
- [x] 313. Test strike lifecycle: miss habits → strikes accumulate → lockout at 5 → choose punishment → reset to 0
- [x] 314. Test freeze lifecycle: 3-day absence → auto-freeze → welcome back → resume
- [x] 315. Test todo lifecycle: create → sticky appears → increment numbered → complete → sticky animates away
- [x] 316. Test alarm lifecycle: create → fires at time → popup appears → snooze → auto-stop audio after 5 min
- [x] 317. Test widget: shows on desktop → holds-to-verify habits → lockout overlay syncs → freeze indicator shows
- [x] 318. Verify 60fps: no layout thrash during animations, no jank on drag, smooth transitions
- [x] 319. Final `agent.md` update: complete architecture overview, all features documented, current version state
- [x] 320. Final code cleanup: remove all `console.log`, verify no TypeScript errors, verify all imports

**✅ BUILD COMPLETE 🏁**

