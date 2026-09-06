/**
 * ─── Application Security & XSS Sanitization ─────────────────────
 * Centralized utilities to sanitize user text inputs, validate external URLs,
 * and prevent Cross-Site Scripting (XSS) and injection vulnerabilities.
 */

/**
 * Strips dangerous HTML tags, script payloads, iframes, on* event handlers,
 * and invisible/non-printable control characters from text inputs.
 * Preserves normal text, unicode characters, emojis, newlines, and standard markdown.
 *
 * @param input The raw input string
 * @param maxLength Optional maximum character length to clamp
 * @returns Cleaned and sanitized string
 */
export function sanitizeText(input: unknown, maxLength?: number): string {
  if (typeof input !== "string") {
    return "";
  }

  let text = input;

  // 1. Strip non-printable ASCII/Unicode control characters (except \n, \r, \t)
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");

  // 2. Remove script tags and contents: <script ...>...</script>
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // 3. Remove iframe tags and contents: <iframe ...>...</iframe>
  text = text.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");

  // 4. Remove object/embed tags and contents
  text = text.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "");
  text = text.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "");

  // 5. Remove style tags and contents
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // 6. Strip inline event handlers like onclick=, onerror=, onload=
  text = text.replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");

  // 7. Strip dangerous pseudo-protocols like javascript: or data:
  text = text.replace(/(?:javascript|data|vbscript):/gi, "");

  // 8. Collapse multiple horizontal spaces into a single space while preserving newlines
  text = text.replace(/[^\S\r\n]+/g, " ").trim();

  // 9. Enforce max length if specified
  if (maxLength && maxLength > 0 && text.length > maxLength) {
    text = text.slice(0, maxLength).trim();
  }

  return text;
}

/**
 * Escapes characters with special meaning in HTML to prevent markup injection.
 */
export function escapeHtml(str: unknown): string {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validates whether a given URL is safe to open/navigate.
 * Only allows HTTP and HTTPS schemes; rejects javascript:, data:, vbscript:, etc.
 *
 * @param url The target URL string
 * @returns The sanitized URL string, or null if unsafe/malformed
 */
export function sanitizeUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  // Reject immediate pseudo-protocols
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Clamps and validates a numeric input within a safe minimum and maximum range.
 * Rejects NaN, Infinity, null, undefined, or non-finite values by returning defaultValue.
 *
 * @param value The input to validate
 * @param min Minimum allowable value
 * @param max Maximum allowable value
 * @param defaultValue Fallback value if invalid
 * @returns Safe clamped number
 */
export function validateNumericRange(
  value: unknown,
  min: number,
  max: number,
  defaultValue: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isNaN(value)) {
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      if (Number.isFinite(parsed) && !Number.isNaN(parsed)) {
        return Math.max(min, Math.min(max, parsed));
      }
    }
    return defaultValue;
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * Validates that a string matches the strict ISO calendar date format YYYY-MM-DD.
 * Verifies both regex format and calendar date validity (e.g. rejects 2026-02-31).
 *
 * @param dateStr Date string to check
 * @returns true if valid YYYY-MM-DD, false otherwise
 */
export function validateIsoDate(dateStr: unknown): boolean {
  if (typeof dateStr !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const [year, month, day] = dateStr.split("-").map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}
