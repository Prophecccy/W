<h1 align="center">[ W ]</h1>

<p align="center">
  <strong>A high-focus, tactical dashboard for daily operations.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri" alt="Tauri">
  <img src="https://img.shields.io/badge/React-UI-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/Status-Beta_v1.0-4ADE80?style=flat-square" alt="Status">
</p>

<br>

> **Note from the Developer:**
> I am building [ W ] because the big-name productivity apps are bloated, expensive, and lack actual discipline. This is a solo project. It is **completely free**, and my goal is simple: to relentlessly update and improve this software until it is the undisputed best self-improvement tool on the planet. No corporate fluff, no paywalls, just absolute focus.

<br>

![Dashboard Preview](link-to-your-dashboard-gif.gif)

## [ THE ARSENAL ]

Unlike standard to-do lists, [ W ] operates as a strict, OS-level dashboard designed to calibrate your waking hours and enforce actual discipline.

* **Waking Fuel (SleepTube):** A real-time, visual gauge that drains based on your precise sleep/wake cycle. Watch your time physically burn away.
* **OS-Level Lockdown:** Native Windows integration that physically blocks banned applications (like games or social media) using a targeted glass overlay. No notifications, just an impenetrable wall.
* **Persistent Desktop Widgets & Sticky Notes:** Your dashboard components and transparent sticky notes stay pinned to your desktop background beneath all other windows. They permanently remember their exact X/Y coordinates across reboots.
* **System Tray Control:** Runs silently in the background with a native taskbar menu, ensuring you always have complete control over the application's lifecycle.
* **Ultralight Footprint:** Because [ W ] is built on Tauri and Rust (not Electron), it runs all these background widgets, overlays, and system monitors while consuming a fraction of the RAM of standard desktop apps. It stays completely out of your hardware's way.

## [ DATA & PRIVACY PROTOCOL ]

> **Disclaimer:** I am a solo developer building this for the community. My motive is to establish a real, human-to-human connection through good software, not to operate like some data-stealing company or corp. [ W ] is a tool for extreme self-improvement, and nobody is touching your data. To ensure cross-platform synchronization, some essential data is stored securely in the cloud, but the architecture is explicitly designed to keep the vast majority of your operations fully local. 

| [ DATA TYPE ] | [ STORAGE LOCATION ] | [ PURPOSE ] |
| :--- | :--- | :--- |
| **Session & OAuth Secrets** | 🔒 HttpOnly AES-GCM Cookie (Web) / Windows DPAPI (Desktop) | Zero-localStorage OAuth session protection via Vercel BFF or native OS vault. |
| **Habits, Todos & Fuel** | 🔒 Local (UID-Scoped IndexedDB) | Local-first encrypted/isolated dashboard state storage. |
| **Google Drive Sync** | ☁️ Personal Cloud (GDrive) | Ownership-verified sync of habits & AES-256-GCM notes (`groqApiKey` excluded). |
| **Local API Keys (Groq)** | 🔒 Local Encrypted Vault (DPAPI / Non-Extractable WebCrypto) | Strict device-only key storage; never leaves your device or enters backups. |
| **Window Coordinates** | 🔒 Local (Disk) | Persistent layout memory. Never leaves your machine. |
| **Lockdown Blocklists** | 🔒 Local (OS Level) | Native process blocking with caller-window guards. Never leaves your machine. |
| **Cloud Firestore Rules** | 🛡️ Default-Deny (`allow read, write: if false`) | Direct client database access disabled across all collections. |

## [ ARCHITECTURE ]

Built for extreme performance, zero-trust boundaries, and deep OS-level control.

* **Core:** Tauri v2 (Rust) — Windows Desktop with per-window least-privilege capabilities, DPAPI vault (TLS 1.2+ zero-redirect token exchange), & rotating `security_audit.jsonl` alerting
* **Web & API:** React (Vite / TypeScript) + Vercel Serverless BFF (`/api/auth/*`) with `v2` HKDF/AAD AES-256-GCM HttpOnly cookies, dynamic server-side RBAC/BOLA guards, & redacted security audit logging (`api/_lib/audit.ts`)
* **Styling:** Pure Vanilla CSS (No Tailwind, strict Design System Tokens)
* **Data & Integrity:** Local-first (UID-scoped IndexedDB, AAD-bound note/secret encryption) + canonical `integritySha256`-verified Backup/Google Drive Sync (Default-Deny `firestore.rules`) & security-gated GitHub Actions CI
* **OS APIs:** `windows-rs` for Z-order manipulation and foreground window interception.

## [ DEPLOYMENT ]

Ready to calibrate your daily operations?

1. Go to the [Releases](https://github.com/Prophecccy/W/releases) page.
2. Download the latest `.exe` installer.
3. Run the setup and complete the initial Fuel Calibration.

*(Note: Windows SmartScreen may flag the installer since it is a new, indie application without an expensive corporate signing certificate. You can safely click "More info" > "Run anyway".)*

---
<p align="center">
  <i>Built to compete. Built to win.</i>
</p>
