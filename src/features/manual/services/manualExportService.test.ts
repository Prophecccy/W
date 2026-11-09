import { describe, it, expect } from "vitest";
import { generateLLMManualContent } from "./manualExportService";
import { MANUAL_CHAPTERS } from "../data/manualContent";

describe("manualExportService", () => {
  it("generates a comprehensive LLM manual with persona instruction and table of contents", () => {
    const text = generateLLMManualContent();

    expect(text).toContain("[ SYSTEM INSTRUCTION FOR LLM ASSISTANT ]");
    expect(text).toContain("W COMMAND CENTER — OFFICIAL MANUAL & AI ASSISTANT KNOWLEDGE BASE");
    expect(text).toContain("TABLE OF CONTENTS");
    expect(text).toContain("APPENDIX: AI QUICK-REFERENCE & TROUBLESHOOTING MATRIX");
  });

  it("includes all 10 manual chapters in the output", () => {
    const text = generateLLMManualContent();

    MANUAL_CHAPTERS.forEach((chapter) => {
      expect(text).toContain(`CHAPTER [${chapter.number}] — ${chapter.title.toUpperCase()}`);
    });
  });

  it("does not contain hallucinated or obsolete references", () => {
    const text = generateLLMManualContent();

    expect(text.toLowerCase()).not.toContain("endfield monospace typography");
    expect(text.toLowerCase()).not.toContain("peak performance window");
    expect(text.toLowerCase()).not.toContain("8-second undo grace period");
  });
});
