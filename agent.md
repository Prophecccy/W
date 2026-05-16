# W — Agent Handoff Document

> **Purpose:** This file tracks the current state of the application architecture, tokens, and rules. All AI agents working on this project MUST read this file to understand the current context before making changes.

## Current State: COMMAND CENTER CALIBRATED 🛠️
The "W" project is a high-focus **Command Center**. It features a tactical dashboard with a side-by-side view of Habits and Todos, anchored by a **SleepTube** "Waking Fuel" gauge that monitors the user's daily progression based on their personalized sleep/wake cycle.

### Dashboard Command Center
- **Viewport Locking**: The dashboard is strictly constrained to `100vh`. Page-level scrolling is disabled (`overflow: hidden`).
- **Internal Scrolling**: Only the Habit and Todo list compartments are permitted to scroll (`overflow-y: auto`) when content exceeds the available vertical space.
- **SleepTube Calibration**: Anchor left, fixed max-height (400px), dynamic theme-based accent color.
- **Daily Note**: Fixed at the bottom of the viewport, non-resizable to prevent layout shifting.
- **Scrolling Constraint**: The main content area uses `flex: 1; min-height: 0; overflow-y: auto;` to ensure internal scrolling works correctly within the flexbox layout without breaking the footer/sidebar alignment.

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
- **lockdown**: (Desktop-only) OS-level monitor that blocks blacklisted apps during focus sessions.
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

### 4. Lockdown Mode (Desktop-Only)
Monitors active window titles using `GetForegroundWindow` (Rust).
- **Violation:** If a blacklisted substring is detected, the app fires a `lockdown-violation` event, adds a strike, and flashes a red overlay for 4 seconds.
### 5. SleepTube (Waking Fuel) System
The `SleepTube` (`src/features/dashboard/components/SleepTube.tsx`) is a vertical gauge monitoring the current "Waking Fuel" percentage.
- **Logic:** Powered by the `useTimeLeft` hook. Operates on a 16-hour (960m) cycle from **07:00 (100%)** to **23:00 (0%)**.
- **Formula:** `100 - ((minutesPassedSince0700 / 960) * 100)`.
- **Sticky UI:** Fixed at `350px-400px` height and `position: sticky` in the dashboard grid to remain visible during list scrolling.
- **Dynamic Theme:** Uses `var(--accent)` for the fill color and outer glow, ensuring consistency with the user's selected theme.
- **Calibration UI:** Includes a high-precision measurement scale with static markers [100, 75, 50, 25, 0] aligned to the right edge of the tube track. Endpoint markers (100 and 0) have hidden ticks for a cleaner measuring instrument aesthetic.
- **Calibration:** If user settings are at default (07:00/23:00), the Dashboard displays a `[ CALIBRATION REQUIRED ]` banner linking to settings.
### 6. Frameless Window Drag Regions
To support native window movement in the frameless Tauri UI, specific elements are designated as drag regions.
- **Pattern:** Use `data-tauri-drag-region` on container elements (e.g., Topbar, Login background).
- **Protection:** Interactive elements (buttons, inputs) MUST have `data-tauri-drag-region="false"` to remain clickable.
- **Aesthetics:** Draggable areas use `user-select: none` to prevent text selection flickering during window movement.
### 7. Habit Creation Wizard
The Habit creation flow is a streamlined 6-step wizard (`src/features/habits/components/HabitForm`).
- **Flow:** Basics → Period → Type → Duration → Appearance → Grouping.
- **Appearance Step:** Focuses exclusively on iconography. The `ColorPicker` is omitted to maintain global theme consistency and prevent accidental overrides during habit setup.
- **Aesthetic:** The icon grid is expanded to fill the vertical space, adhering to the "Instrument" design philosophy.

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
