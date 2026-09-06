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
