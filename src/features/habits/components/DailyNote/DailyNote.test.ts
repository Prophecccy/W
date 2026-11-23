import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { DailyNote } from "./DailyNote";
import { formatTranscribedText } from "../../services/transcriptionService";
import { testGroqApiKey } from "../../services/groqTranscription";

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

    // Verify dictation integration
    expect(content).toContain("useAudioRecorder");
    expect(content).toContain("transcribeAudio");
    expect(content).toContain("daily-note-dictation");
  });

  it("formats and clamps transcribed text accurately", () => {
    // Normal capitalization and trimming
    const text = formatTranscribedText("  had a productive morning coding  ", 0, 20000);
    expect(text).toBe("Had a productive morning coding");

    // Clamps to remaining character limit
    const longInput = "a".repeat(100);
    const clamped = formatTranscribedText(longInput, 19950, 20000);
    expect(clamped.length).toBe(50);
  });

  it("validates Groq API key error handling", async () => {
    // Rejects empty API key
    const emptyResult = await testGroqApiKey("");
    expect(emptyResult.valid).toBe(false);

    // Handles network rejection gracefully
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as unknown as Response);

    const invalidResult = await testGroqApiKey("invalid_key");
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.error).toBe("Invalid API key.");
  });
});
