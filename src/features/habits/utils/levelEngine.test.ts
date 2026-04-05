import { describe, it, expect } from "vitest";
import { calculateLevel, getLevelThresholds } from "./levelEngine";

describe("calculateLevel", () => {
  it("returns level 0 for 0 completions", () => {
    const result = calculateLevel(0);
    expect(result.level).toBe(0);
    expect(result.label).toBe("Nil");
    expect(result.progressPercent).toBe(0);
  });

  it("returns level 0 for 4 completions (below L1 threshold)", () => {
    const result = calculateLevel(4);
    expect(result.level).toBe(0);
    expect(result.progress).toBe(4);
    expect(result.nextThreshold).toBe(5); // 5 - 0
  });

  it("returns level 1 at exactly 5 completions", () => {
    const result = calculateLevel(5);
    expect(result.level).toBe(1);
    expect(result.label).toBe("Novice");
    expect(result.progress).toBe(0); // 5 - 5
    expect(result.nextThreshold).toBe(10); // 15 - 5
  });

  it("returns level 2 at 15 completions", () => {
    const result = calculateLevel(15);
    expect(result.level).toBe(2);
    expect(result.label).toBe("Apprentice");
  });

  it("returns correct progress within a level", () => {
    // Level 2 = 15..29, level 3 threshold = 30
    const result = calculateLevel(20);
    expect(result.level).toBe(2);
    expect(result.progress).toBe(5); // 20 - 15
    expect(result.nextThreshold).toBe(15); // 30 - 15
    expect(result.progressPercent).toBe(33); // round(5/15 * 100)
  });

  it("returns level 5 at 100 completions", () => {
    const result = calculateLevel(100);
    expect(result.level).toBe(5);
    expect(result.label).toBe("Expert");
  });

  it("returns level 10 at exactly 1000 completions", () => {
    const result = calculateLevel(1000);
    expect(result.level).toBe(10);
    expect(result.label).toBe("Apex");
    expect(result.progressPercent).toBe(100);
  });

  it("returns level 10 at 5000 completions (beyond max)", () => {
    const result = calculateLevel(5000);
    expect(result.level).toBe(10);
    expect(result.label).toBe("Apex");
    expect(result.progressPercent).toBe(100);
  });

  it("handles edge case: right below level 10", () => {
    const result = calculateLevel(999);
    expect(result.level).toBe(9);
    expect(result.label).toBe("Mythic");
  });
});

describe("getLevelThresholds", () => {
  it("returns 11 levels (0-10)", () => {
    const thresholds = getLevelThresholds();
    expect(thresholds).toHaveLength(11);
  });

  it("starts at 0 and ends at 1000", () => {
    const thresholds = getLevelThresholds();
    expect(thresholds[0].minCompletions).toBe(0);
    expect(thresholds[10].minCompletions).toBe(1000);
  });

  it("thresholds are strictly increasing", () => {
    const thresholds = getLevelThresholds();
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i].minCompletions).toBeGreaterThan(
        thresholds[i - 1].minCompletions
      );
    }
  });
});
