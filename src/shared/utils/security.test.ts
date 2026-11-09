import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeUrl, escapeHtml, validateNumericRange, validateIsoDate } from "./security";

describe("security utility - sanitizeText", () => {
  it("removes script tags and their inner content", () => {
    const dirty = "Read book <script>alert('xss')</script> daily";
    expect(sanitizeText(dirty)).toBe("Read book daily");
  });

  it("removes iframe tags and their inner content", () => {
    const dirty = "My habit <iframe src='http://evil.com'></iframe> tracker";
    expect(sanitizeText(dirty)).toBe("My habit tracker");
  });

  it("removes inline event handlers like onerror and onclick", () => {
    const dirty = '<img src="x" onerror="alert(1)"> Morning Run';
    expect(sanitizeText(dirty)).toBe('<img src="x" > Morning Run');
  });

  it("removes dangerous pseudo-protocols", () => {
    const dirty = "javascript:alert(document.cookie)";
    expect(sanitizeText(dirty)).toBe("alert(document.cookie)");
  });

  it("strips invisible control characters like null bytes", () => {
    const dirty = "Habit\u0000\u0007\u001F Name";
    expect(sanitizeText(dirty)).toBe("Habit Name");
  });

  it("preserves emojis, unicode text, and standard punctuation", () => {
    const text = "🔥 Workout 100% — 日本語, Café & Résumé!";
    expect(sanitizeText(text)).toBe("🔥 Workout 100% — 日本語, Café & Résumé!");
  });

  it("preserves newlines and standard markdown", () => {
    const markdown = "# Title\n* Point 1\n* Point 2\n**Bold** and *Italic*";
    expect(sanitizeText(markdown)).toBe(markdown);
  });

  it("clamps maximum length when requested", () => {
    const longText = "a".repeat(150);
    expect(sanitizeText(longText, 100).length).toBe(100);
  });

  it("handles non-string values gracefully", () => {
    expect(sanitizeText(null)).toBe("");
    expect(sanitizeText(undefined)).toBe("");
    expect(sanitizeText(12345)).toBe("");
  });
});

describe("security utility - sanitizeUrl", () => {
  it("accepts valid https URLs", () => {
    expect(sanitizeUrl("https://github.com/Prophecccy/W")).toBe("https://github.com/Prophecccy/W");
  });

  it("accepts valid http URLs", () => {
    expect(sanitizeUrl("http://localhost:1420")).toBe("http://localhost:1420");
  });

  it("rejects javascript: URLs", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("JAVASCRIPT:void(0)")).toBeNull();
  });

  it("rejects data: URLs", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects file: and vbscript: URLs", () => {
    expect(sanitizeUrl("file:///C:/Windows/system32")).toBeNull();
    expect(sanitizeUrl("vbscript:msgbox")).toBeNull();
  });

  it("rejects invalid, relative, or empty URLs", () => {
    expect(sanitizeUrl("")).toBeNull();
    expect(sanitizeUrl("   ")).toBeNull();
    expect(sanitizeUrl("not-a-valid-url")).toBeNull();
    expect(sanitizeUrl(null)).toBeNull();
  });
});

describe("security utility - escapeHtml", () => {
  it("escapes special HTML characters", () => {
    expect(escapeHtml("<script>alert('xss') & \"quotes\"</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;) &amp; &quot;quotes&quot;&lt;/script&gt;"
    );
  });

  it("handles non-string inputs safely", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("security utility - validateNumericRange", () => {
  it("clamps numbers within range", () => {
    expect(validateNumericRange(5, 1, 10, 1)).toBe(5);
    expect(validateNumericRange(0, 1, 10, 1)).toBe(1);
    expect(validateNumericRange(100, 1, 10, 1)).toBe(10);
  });

  it("parses string representations of valid numbers", () => {
    expect(validateNumericRange("7", 1, 10, 1)).toBe(7);
  });

  it("returns default value for NaN, Infinity, null, and non-numbers", () => {
    expect(validateNumericRange(NaN, 1, 10, 5)).toBe(5);
    expect(validateNumericRange(Infinity, 1, 10, 5)).toBe(5);
    expect(validateNumericRange(null, 1, 10, 5)).toBe(5);
    expect(validateNumericRange(undefined, 1, 10, 5)).toBe(5);
    expect(validateNumericRange("invalid", 1, 10, 5)).toBe(5);
  });
});

describe("security utility - validateIsoDate", () => {
  it("validates valid ISO YYYY-MM-DD dates", () => {
    expect(validateIsoDate("2026-05-19")).toBe(true);
    expect(validateIsoDate("2024-02-29")).toBe(true); // leap year
  });

  it("rejects non-existent calendar dates", () => {
    expect(validateIsoDate("2026-02-31")).toBe(false);
    expect(validateIsoDate("2026-04-31")).toBe(false);
    expect(validateIsoDate("2026-13-01")).toBe(false);
    expect(validateIsoDate("2026-00-01")).toBe(false);
  });

  it("rejects malformed date strings or injections", () => {
    expect(validateIsoDate("2026-5-19")).toBe(false);
    expect(validateIsoDate("2026/05/19")).toBe(false);
    expect(validateIsoDate("2026-05-19; DROP TABLE")).toBe(false);
    expect(validateIsoDate(null)).toBe(false);
    expect(validateIsoDate(12345678)).toBe(false);
  });
});

import { validateDocumentPayload } from "../services/localDb";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("DAL Storage Gate - validateDocumentPayload", () => {
  it("accepts valid plain document objects", () => {
    const payload = { title: "Daily Workout", target: 5, frequency: "daily" };
    const validated = validateDocumentPayload(payload, "users/test-uid/habits/h1");
    expect(validated.title).toBe("Daily Workout");
    expect(validated.target).toBe(5);
  });

  it("rejects non-object and array payloads", () => {
    expect(() => validateDocumentPayload(null, "users/uid/habits/h1")).toThrow("plain object");
    expect(() => validateDocumentPayload("string-payload", "users/uid/habits/h1")).toThrow("plain object");
    expect(() => validateDocumentPayload([1, 2, 3], "users/uid/habits/h1")).toThrow("plain object");
  });

  it("neutralizes prototype pollution keys (__proto__, constructor, prototype)", () => {
    const malicious = JSON.parse('{"title":"Legit","__proto__":{"admin":true},"constructor":{"polluted":true}}');
    const cleaned: any = validateDocumentPayload(malicious, "users/uid/habits/h1");
    expect(cleaned.title).toBe("Legit");
    expect(cleaned.__proto__.admin).toBeUndefined();
    expect(cleaned.constructor.polluted).toBeUndefined();
  });

  it("rejects path traversal attempts", () => {
    expect(() => validateDocumentPayload({ title: "Bad" }, "users/../secret")).toThrow("Path traversal");
    expect(() => validateDocumentPayload({ title: "Bad" }, "users\\system\\root")).toThrow("Path traversal");
  });

  it("rejects payloads exceeding size limits", () => {
    const hugePayload = { data: "x".repeat(600_000) };
    expect(() => validateDocumentPayload(hugePayload, "users/uid/habits/h1")).toThrow("exceeds limit");
  });
});

describe("Secrets Management - Static Secret Scanning", () => {
  it("verifies .env.example contains only placeholders, no real secrets", () => {
    const envExamplePath = path.resolve(__dirname, "../../../.env.example");
    if (fs.existsSync(envExamplePath)) {
      const content = fs.readFileSync(envExamplePath, "utf-8");
      expect(content).not.toMatch(/AIzaSy[A-Za-z0-9_-]{33}/);
      expect(content).not.toContain("GOCSPX-");
      expect(content).toContain("your-client-id-here");
    }
  });

  it("verifies authService reads Google secrets from environment variables, not hardcoded strings", () => {
    const authServicePath = path.resolve(__dirname, "../../features/auth/services/authService.ts");
    const content = fs.readFileSync(authServicePath, "utf-8");
    expect(content).toContain("import.meta.env.VITE_GOOGLE_CLIENT_ID");
    expect(content).not.toMatch(/client_id:\s*["'][0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com["']/);
  });

  it("verifies src-tauri/tauri.conf.json does not contain private keys and enforces desktop CSP", () => {
    const tauriConfPath = path.resolve(__dirname, "../../../src-tauri/tauri.conf.json");
    const content = fs.readFileSync(tauriConfPath, "utf-8");
    expect(content).not.toContain("BEGIN PRIVATE KEY");
    expect(content).not.toContain("tauri.key");

    const parsed = JSON.parse(content);
    expect(parsed.app.security.csp).toBeDefined();
    expect(parsed.app.security.csp).toContain("default-src 'self'");
    expect(parsed.app.security.csp).toContain("https://accounts.google.com");
  });

  it("verifies src-tauri/Cargo.toml configures native binary obfuscation and symbol stripping", () => {
    const cargoTomlPath = path.resolve(__dirname, "../../../src-tauri/Cargo.toml");
    const content = fs.readFileSync(cargoTomlPath, "utf-8");
    expect(content).toContain("[profile.release]");
    expect(content).toContain("strip = true");
    expect(content).toContain("lto = true");
    expect(content).toContain('panic = "abort"');
    expect(content).toContain("codegen-units = 1");
  });
});

describe("OAuth Flow & Token Relay Architecture", () => {
  it("verifies main.tsx implements early OAuth popup interception before mounting React Router", () => {
    const mainPath = path.resolve(__dirname, "../../main.tsx");
    const content = fs.readFileSync(mainPath, "utf-8");
    expect(content).toContain("handleEarlyOAuthCallback");
    expect(content).toContain("w:google-oauth-callback");
    expect(content).toContain("w_oauth_response");
    expect(content).toContain("window.close()");
    expect(content).toContain("!handleEarlyOAuthCallback()");
  });

  it("verifies authService exports processGoogleOAuthToken and implements tri-channel message/storage/polling listeners", () => {
    const authServicePath = path.resolve(__dirname, "../../features/auth/services/authService.ts");
    const content = fs.readFileSync(authServicePath, "utf-8");
    expect(content).toContain("export async function processGoogleOAuthToken");
    expect(content).toContain('addEventListener("message"');
    expect(content).toContain('addEventListener("storage"');
    expect(content).toContain("w:google-oauth-callback");
    expect(content).toContain("w_oauth_response");
  });

  it("verifies AuthGuard guards against premature redirect to /login when access_token is in URL hash", () => {
    const authGuardPath = path.resolve(__dirname, "../../features/auth/components/AuthGuard.tsx");
    const content = fs.readFileSync(authGuardPath, "utf-8");
    expect(content).toContain("hasPendingOAuthToken");
    expect(content).toContain('window.location.hash.includes("access_token=")');
  });

  it("verifies useAuth provides direct same-window OAuth redirect handling", () => {
    const useAuthPath = path.resolve(__dirname, "../../features/auth/hooks/useAuth.ts");
    const content = fs.readFileSync(useAuthPath, "utf-8");
    expect(content).toContain('hash.includes("access_token=")');
    expect(content).toContain("processGoogleOAuthToken");
    expect(content).toContain("window.history.replaceState");
  });
});

describe("Real-Time Cross-Device Google Drive Sync Architecture", () => {
  it("verifies localDb.ts uploads state as clean cross-device JSON and supports legacy envelopes", () => {
    const localDbPath = path.resolve(__dirname, "../services/localDb.ts");
    const content = fs.readFileSync(localDbPath, "utf-8");
    expect(content).toContain("JSON.stringify(statePayload, null, 2)");
    expect(content).toContain("parsedEnvelope.encrypted");
    expect(content).toContain("parsedEnvelope.habits !== undefined");
  });

  it("verifies localDb.ts registers 10s fast polling, window focus, and visibilitychange sync triggers", () => {
    const localDbPath = path.resolve(__dirname, "../services/localDb.ts");
    const content = fs.readFileSync(localDbPath, "utf-8");
    expect(content).toContain("10_000");
    expect(content).toContain('addEventListener("focus"');
    expect(content).toContain('addEventListener("visibilitychange"');
  });

  it("verifies googleDriveService.ts restores Web sessions with empty refresh tokens and exports flushAndPullAll", () => {
    const gdrivePath = path.resolve(__dirname, "../services/googleDriveService.ts");
    const content = fs.readFileSync(gdrivePath, "utf-8");
    expect(content).toContain("if (accessToken && expiresAtStr)");
    expect(content).toContain("export async function flushAndPullAll");
    expect(content).toContain("await pullNotesFromDrive(accessToken)");
  });

  it("verifies DailyNote.tsx updates note content when w:note-synced event is captured", () => {
    const dailyNotePath = path.resolve(__dirname, "../../features/habits/components/DailyNote/DailyNote.tsx");
    const content = fs.readFileSync(dailyNotePath, "utf-8");
    expect(content).toContain("getLocalNoteRecord(today)");
    expect(content).toContain("record.notes !== latestNoteRef.current");
  });

  it("verifies Layout.tsx implements 15s heartbeat and eager focus/visibility sync", () => {
    const layoutPath = path.resolve(__dirname, "../../app/Layout.tsx");
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("15000");
    expect(content).toContain('addEventListener("focus", triggerImmediateSync)');
    expect(content).toContain('document.addEventListener("visibilitychange", handleVisibilityChange)');
  });

  it("verifies Layout.tsx gates processGap behind verified pullAndMergeFromGoogleDrive(true)", () => {
    const layoutPath = path.resolve(__dirname, "../../app/Layout.tsx");
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("pullAndMergeFromGoogleDrive(true)");
    expect(content).toContain("syncSuccess");
    expect(content).toContain("Pre-gap Google Drive sync failed or session expired");
  });
});

describe("Unified SSO & Sovereign State Ownership Security Architecture", () => {
  it("verifies localDb.ts wraps state in a v2 Ownership Envelope with ownerEmail and ownerUid", () => {
    const localDbPath = path.resolve(__dirname, "../services/localDb.ts");
    const content = fs.readFileSync(localDbPath, "utf-8");
    expect(content).toContain("version: 2");
    expect(content).toContain("ownerEmail: user.email");
    expect(content).toContain("ownerUid: user.uid");
  });

  it("verifies localDb.ts contains the Ownership Guard in pullAndMergeFromGoogleDrive to prevent cross-account clobbering", () => {
    const localDbPath = path.resolve(__dirname, "../services/localDb.ts");
    const content = fs.readFileSync(localDbPath, "utf-8");
    expect(content).toContain("remoteState.ownerEmail");
    expect(content).toContain("remoteState.ownerEmail.toLowerCase().trim() !== user.email.toLowerCase().trim()");
    expect(content).toContain("SECURITY ABORT");
  });

  it("verifies googleDriveService.ts pins OAuth sessions to user email and cleans up on logout", () => {
    const gdrivePath = path.resolve(__dirname, "../services/googleDriveService.ts");
    const content = fs.readFileSync(gdrivePath, "utf-8");
    expect(content).toContain("userEmail?: string | null");
    expect(content).toContain("localStorage.setItem(USER_EMAIL_KEY, finalEmail)");
    expect(content).toContain("localStorage.removeItem(USER_EMAIL_KEY)");
    expect(content).toContain("export async function getSessionUserEmail");
  });

  it("verifies authService.ts validates identity and purges local cache on account switch", () => {
    const authPath = path.resolve(__dirname, "../../features/auth/services/authService.ts");
    const content = fs.readFileSync(authPath, "utf-8");
    expect(content).toContain("Account switch detected");
    expect(content).toContain("idbClear()");
    expect(content).toContain("saveOAuthTokens(accessToken, refreshToken || \"\", expiresInSeconds, email || undefined)");
  });

  it("verifies AccountSection.tsx eliminates decoupled unlink and provides unified disconnect", () => {
    const accountSectionPath = path.resolve(__dirname, "../../features/settings/components/AccountSection.tsx");
    const content = fs.readFileSync(accountSectionPath, "utf-8");
    expect(content).not.toContain("handleUnlinkDrive");
    expect(content).toContain("[ SIGN OUT / DISCONNECT ]");
    expect(content).toContain("[ CONNECTED & LOCKED ]");
  });
});

describe("Strike System Zen Mode & Cross-Device Disablement Architecture", () => {
  it("verifies localDb.ts deep-merges settings, respects strikeSystemEnabled: false, and zeroes strikes.current", () => {
    const localDbPath = path.resolve(__dirname, "../services/localDb.ts");
    const content = fs.readFileSync(localDbPath, "utf-8");
    expect(content).toContain("remote.settings?.strikeSystemEnabled === false || local.settings?.strikeSystemEnabled === false");
    expect(content).toContain("newerSettings.strikeSystemEnabled = false");
    expect(content).toContain("merged.settings?.strikeSystemEnabled === false");
    expect(content).toContain("current: 0");
  });

  it("verifies useStrikes.ts provides lockout immunity when strikeSystemEnabled is false", () => {
    const useStrikesPath = path.resolve(__dirname, "../../features/strikes/hooks/useStrikes.ts");
    const content = fs.readFileSync(useStrikesPath, "utf-8");
    expect(content).toContain("effectiveStrikes = strikeSystemEnabled ? strikes : { ...strikes, current: 0 }");
    expect(content).toContain("isLocked = strikeSystemEnabled && strikes.current >= MAX_STRIKES");
  });

  it("verifies Layout.tsx implements startup auto-healing for disabled strike systems", () => {
    const layoutPath = path.resolve(__dirname, "../../app/Layout.tsx");
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("doc.settings?.strikeSystemEnabled === false && (doc.strikes?.current ?? 0) > 0");
    expect(content).toContain("resetStrikes");
  });

  it("verifies LockoutOverlay.tsx refreshes the window upon successful Google Drive sync", () => {
    const lockoutPath = path.resolve(__dirname, "../../features/strikes/components/LockoutOverlay.tsx");
    const content = fs.readFileSync(lockoutPath, "utf-8");
    expect(content).toContain("SYNC COMPLETE: REFRESHING...");
    expect(content).toContain("window.location.reload()");
  });

  it("verifies localDb.ts reconciles multi-device false auto-absence freezes", () => {
    const localDbPath = path.resolve(__dirname, "../services/localDb.ts");
    const content = fs.readFileSync(localDbPath, "utf-8");
    expect(content).toContain("remote.freeze && remote.freeze.active === false && local.freeze?.reason === \"auto_absence\"");
    expect(content).toContain("active: false");
    expect(content).toContain("remoteLastActive > localLastActive && remote.freeze");
  });

  it("verifies Layout.tsx implements self-healing for false auto-absence freezes", () => {
    const layoutPath = path.resolve(__dirname, "../../app/Layout.tsx");
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("doc.freeze?.reason === \"auto_absence\"");
    expect(content).toContain("doc.lastActiveDate > doc.freeze.startDate");
    expect(content).toContain("deactivateFreeze");
  });

  it("verifies Topbar.tsx provides one-click unfreeze directly from the frozen badge", () => {
    const topbarPath = path.resolve(__dirname, "../components/Topbar/Topbar.tsx");
    const content = fs.readFileSync(topbarPath, "utf-8");
    expect(content).toContain("handleUnfreeze");
    expect(content).toContain("deactivateFreeze");
    expect(content).toContain("[ FROZEN — CLICK TO RESUME ]");
  });
});



