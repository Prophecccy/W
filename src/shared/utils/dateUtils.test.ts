import { describe, it, expect, beforeEach } from "vitest";
import { getToday, formatDate, subtractDays, isBeforeResetTime } from "./dateUtils";

// Mock localStorage for Node test environment
if (typeof localStorage === "undefined") {
  const store: Record<string, string> = {};
  global.localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k in store) delete store[k]; },
    length: 0,
    key: (index: number) => Object.keys(store)[index] || null,
  } as any;
}

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

describe("getToday", () => {
  beforeEach(() => {
    localStorage.removeItem("w_daily_reset_time");
  });

  it("returns yesterday when time is before default 04:00 reset time", () => {
    localStorage.setItem("w_daily_reset_time", "04:00");
    const testDate = new Date(2026, 4, 18, 2, 30); // May 18th 02:30 AM
    expect(getToday(testDate)).toBe("2026-05-17");
  });

  it("returns today when time is after default 04:00 reset time", () => {
    localStorage.setItem("w_daily_reset_time", "04:00");
    const testDate = new Date(2026, 4, 18, 5, 30); // May 18th 05:30 AM
    expect(getToday(testDate)).toBe("2026-05-18");
  });

  it("handles custom reset time (e.g., 06:00)", () => {
    localStorage.setItem("w_daily_reset_time", "06:00");
    const testDate = new Date(2026, 4, 18, 5, 30); // May 18th 05:30 AM
    expect(getToday(testDate)).toBe("2026-05-17");

    const testDateAfter = new Date(2026, 4, 18, 6, 30); // May 18th 06:30 AM
    expect(getToday(testDateAfter)).toBe("2026-05-18");
  });

  it("defaults to 04:00 if no cached reset time is present in localStorage", () => {
    // Before 4 AM
    const testDateBefore = new Date(2026, 4, 18, 3, 59);
    expect(getToday(testDateBefore)).toBe("2026-05-17");

    // After 4 AM
    const testDateAfter = new Date(2026, 4, 18, 4, 0);
    expect(getToday(testDateAfter)).toBe("2026-05-18");
  });

  it("prioritizes resetTimeOverride parameter over localStorage cache", () => {
    localStorage.setItem("w_daily_reset_time", "06:00");
    const testDate = new Date(2026, 4, 18, 5, 30); // May 18th 05:30 AM
    // Since 05:30 is AFTER 05:00 override, it should return today
    expect(getToday(testDate, "05:00")).toBe("2026-05-18");
    // Since 05:30 is BEFORE 06:00 override, it should return yesterday
    expect(getToday(testDate, "06:00")).toBe("2026-05-17");
  });
});
