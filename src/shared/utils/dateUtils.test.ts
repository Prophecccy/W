import { describe, it, expect } from "vitest";
import { formatDate, subtractDays, isBeforeResetTime } from "./dateUtils";

describe("formatDate", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("pads single-digit months and days", () => {
    expect(formatDate(new Date(2026, 2, 9))).toBe("2026-03-09");
  });

  it("handles December 31", () => {
    expect(formatDate(new Date(2025, 11, 31))).toBe("2025-12-31");
  });
});

describe("subtractDays", () => {
  it("subtracts 1 day", () => {
    expect(subtractDays("2026-04-05", 1)).toBe("2026-04-04");
  });

  it("crosses month boundaries", () => {
    expect(subtractDays("2026-03-01", 1)).toBe("2026-02-28");
  });

  it("subtracts 0 days returns same date", () => {
    expect(subtractDays("2026-06-15", 0)).toBe("2026-06-15");
  });

  it("subtracts 30 days", () => {
    expect(subtractDays("2026-01-31", 30)).toBe("2026-01-01");
  });

  it("crosses year boundaries", () => {
    expect(subtractDays("2026-01-01", 1)).toBe("2025-12-31");
  });
});

describe("isBeforeResetTime", () => {
  it("returns true when current time is before reset", () => {
    const date = new Date(2026, 3, 5, 3, 30); // 03:30
    expect(isBeforeResetTime(date, "04:00")).toBe(true);
  });

  it("returns false when current time is after reset", () => {
    const date = new Date(2026, 3, 5, 5, 0); // 05:00
    expect(isBeforeResetTime(date, "04:00")).toBe(false);
  });

  it("returns false when current time equals reset exactly", () => {
    const date = new Date(2026, 3, 5, 4, 0); // 04:00
    expect(isBeforeResetTime(date, "04:00")).toBe(false);
  });

  it("returns true when same hour but earlier minute", () => {
    const date = new Date(2026, 3, 5, 4, 29); // 04:29
    expect(isBeforeResetTime(date, "04:30")).toBe(true);
  });

  it("returns true at midnight with morning reset", () => {
    const date = new Date(2026, 3, 5, 0, 0); // 00:00
    expect(isBeforeResetTime(date, "06:00")).toBe(true);
  });
});
