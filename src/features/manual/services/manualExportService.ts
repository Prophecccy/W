import { MANUAL_CHAPTERS, ManualChapter } from "../data/manualContent";

/**
 * Compiles the entire in-app manual into a single structured, high-density plain-text file
 * pre-seeded with a comprehensive System Instruction for any LLM (ChatGPT, Claude, Gemini, Ollama, etc.).
 */
export function generateLLMManualContent(): string {
  const generatedDate = new Date().toISOString().split("T")[0];

  const header = `================================================================================
W COMMAND CENTER — OFFICIAL MANUAL & AI ASSISTANT KNOWLEDGE BASE
================================================================================
VERSION: 1.8.5 (Tactical Release)
GENERATED ON: ${generatedDate}
FORMAT: Optimized LLM Prompt & Grounding Knowledge Base

[ SYSTEM INSTRUCTION FOR LLM ASSISTANT ]
You are the dedicated AI Operations Guide and Personal Assistant for the "W" Command Center desktop application.
The user has provided you with this comprehensive, authoritative manual so you can help them navigate, configure, troubleshoot, and master the app.

When answering user questions:
1. BE TACTICAL, CONCISE, AND ACTIONABLE: Provide direct, operational answers without fluff or unneeded preamble.
2. REFERENCE EXACT NAVIGATION PATHS:
   - Primary Sidebar Modules: [ Dashboard ], [ Habits ], [ Todos ], [ Logbook ], [ Lockdown ], [ Analytics ], [ Manual ], [ Settings ]
   - Settings Tabs: [ ACCOUNT ], [ SCHEDULE & TIME ], [ SLEEP TUBE ], [ DESKTOP COMPANIONS ], [ DISCIPLINE ], [ WALLPAPERS ], [ APPEARANCE ], [ NOTIFICATIONS ], [ DATA & SYSTEM ]
3. PROVIDE EXACT STEP-BY-STEP WORKFLOWS: When asked how to do something (e.g. reset a lost widget, resolve lockout, change reset time, convert a todo to a desktop sticky note, configure sleep fuel hours, or sync notes with Google Drive), provide exact keystrokes, button labels, and menu paths based strictly on this manual.
4. EXPLAIN THE "WHY" WHEN RELEVANT: Reference the W philosophy (radical personal accountability, biological circadian realism, local-first data sovereignty).
5. DO NOT INVENT FEATURES: Strictly answer based on what is documented below. If a user asks about a feature not in the app, clarify that it is not part of the W architecture.

================================================================================
TABLE OF CONTENTS
================================================================================
${MANUAL_CHAPTERS.map(c => `Chapter ${c.number}: ${c.title}`).join("\n")}
Appendix: AI Quick-Reference & Troubleshooting Matrix
================================================================================

`;

  const chaptersText = MANUAL_CHAPTERS.map(renderChapterText).join("\n\n" + "=".repeat(80) + "\n\n");

  const appendix = `
================================================================================
APPENDIX: AI QUICK-REFERENCE & TROUBLESHOOTING MATRIX
================================================================================

Q1: Where did my Desktop Widget go? / The widget is lost off-screen!
A1: Navigate to [ SETTINGS ] → [ DESKTOP COMPANIONS ] and click the button [ RESET WIDGET POSITION ]. This immediately teleports the widget back onto your primary monitor at a safe visible coordinate.

Q2: How do Desktop Sticky Notes work across multiple monitors?
A2: From the [ Todos ] page, click the pin icon on any active task. It casts onto the desktop overlay as a draggable note. Note coordinates are saved strictly locally on disk. If a 2nd monitor is disconnected, W temporarily moves notes onto the primary monitor without overwriting their 2nd-monitor coordinates. When the 2nd monitor is plugged back in, W automatically detects the display change and restores them back to their exact position on the 2nd monitor.

Q3: Why didn't my habits reset at midnight?
A3: W defaults the Daily Reset Time to 04:00 AM so night owls working past midnight aren't unfairly penalized with missed streaks. You can customize this reset hour anytime in [ SETTINGS ] → [ SCHEDULE & TIME ].

Q4: What happens if I reach 5 strikes? How do I resolve System Lockdown?
A4: Reaching 5 strikes locks the Command Center viewport. Click [ RESOLVE LOCKOUT ] to choose one of three penance protocols:
    1. [ INCREASE DIFFICULTY ]: Increases the target on one active habit by +33%.
    2. [ ADD NEW HABIT ]: Commits to an additional daily habit.
    3. [ ADD NEW TODO ]: Commits to an urgent high-priority task.
    Once chosen, all 5 strikes reset to 0/5 and the app unlocks. Alternatively, toggling "Strike System Discipline" OFF in [ SETTINGS ] → [ DISCIPLINE ] disables strikes and immediately unlocks the interface.

Q5: Where do my daily notes live? Are they private?
A5: Daily notes in the Logbook are saved locally to IndexedDB and encrypted at rest with AES-256-GCM. If Google Drive is linked, notes sync directly to your personal Drive root folder (W_Logbook / [Year] / [Date].md) via OAuth PKCE with zero third-party intermediary servers.

Q6: How do I quickly capture a task or habit without leaving what I'm doing?
A6: Press Ctrl+K to open the universal Command Palette with natural language capture (e.g. "new todo Buy groceries tomorrow urgent" or "new habit Cold shower daily"), or press Ctrl+N (or click [ + TODO ] on the desktop widget) to open the floating quick todo creator.

Q7: Where is the Lockdown app blocker configured?
A7: Lockdown is an independent top-level command module located in the primary sidebar under [ LOCKDOWN ] (not inside Settings).

================================================================================
END OF W COMMAND CENTER MANUAL
================================================================================
`;

  return header + chaptersText + "\n" + appendix;
}

function renderChapterText(chapter: ManualChapter): string {
  let out = `--------------------------------------------------------------------------------\n`;
  out += `CHAPTER [${chapter.number}] — ${chapter.title.toUpperCase()}\n`;
  out += `--------------------------------------------------------------------------------\n`;
  out += `Summary: ${chapter.summary}\n`;
  out += `Keywords: ${chapter.keywords.join(", ")}\n\n`;

  chapter.sections.forEach((sec, idx) => {
    out += `[ SECTION ${idx + 1}: ${sec.title.toUpperCase()}${sec.tag ? ` (${sec.tag})` : ""} ]\n`;
    
    if (sec.content && sec.content.length > 0) {
      out += sec.content.join("\n\n") + "\n\n";
    }

    if (sec.subsections && sec.subsections.length > 0) {
      sec.subsections.forEach(sub => {
        out += `  • ${sub.title}\n`;
        out += `    ${sub.description}\n`;
        if (sub.bulletPoints && sub.bulletPoints.length > 0) {
          sub.bulletPoints.forEach(bp => {
            out += `      - ${bp}\n`;
          });
        }
        out += `\n`;
      });
    }

    if (sec.callouts && sec.callouts.length > 0) {
      sec.callouts.forEach(c => {
        out += `  >>> [ ${c.type.toUpperCase()}: ${c.title} ]\n`;
        out += `  ${c.text.replace(/\n/g, "\n  ")}\n\n`;
      });
    }
  });

  return out.trimEnd();
}

/**
 * Triggers a file save dialog in Tauri (or browser download fallback) to export the manual.
 */
export async function exportManualForLLM(): Promise<boolean> {
  const content = generateLLMManualContent();
  const filename = `W_COMMAND_CENTER_MANUAL_FOR_LLM.txt`;

  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");

    const filePath = await save({
      defaultPath: filename,
      filters: [{ name: "Text File", extensions: ["txt"] }],
    });

    if (filePath) {
      await writeTextFile(filePath, content);
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Tauri file dialog unavailable, falling back to browser download:", err);
    triggerBrowserDownload(content, filename, "text/plain;charset=utf-8");
    return true;
  }
}

function triggerBrowserDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
