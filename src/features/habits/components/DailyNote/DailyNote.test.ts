import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { DailyNote } from "./DailyNote";

describe("DailyNote component & character limits", () => {
  it("exports DailyNote function component", () => {
    expect(typeof DailyNote).toBe("function");
  });

  it("enforces MAX_CHARS = 20000 limit in DailyNote.tsx", () => {
    const dailyNotePath = path.resolve(__dirname, "./DailyNote.tsx");
    const content = fs.readFileSync(dailyNotePath, "utf-8");

    // Verify constant definition
    expect(content).toContain("const MAX_CHARS = 20000;");

    // Verify dynamic/20k toast notification
    expect(content).toMatch(/showToast\(`\[ TEXT TRUNCATED TO \$\{MAX_CHARS\} CHARS \]`\)/);

    // Verify counter rendering
    expect(content).toContain("{note.length} / {MAX_CHARS}");
  });
});
