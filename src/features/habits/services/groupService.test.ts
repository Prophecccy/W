import { describe, it, expect } from "vitest";
import { sanitizeGroupName } from "./groupService";

describe("sanitizeGroupName", () => {
  it("trims whitespace", () => {
    expect(sanitizeGroupName("  Work  ")).toBe("Work");
  });

  it("strips outer brackets", () => {
    expect(sanitizeGroupName("[ WORK ]")).toBe("WORK");
    expect(sanitizeGroupName("  [WORK]  ")).toBe("WORK");
  });

  it("strips nested outer brackets recursively", () => {
    expect(sanitizeGroupName("[[ WORK ]]")).toBe("WORK");
    expect(sanitizeGroupName(" [ [ WORK ] ] ")).toBe("WORK");
  });

  it("leaves inner brackets intact", () => {
    expect(sanitizeGroupName("[ WORK [NEW] ]")).toBe("WORK [NEW]");
  });

  it("handles empty or brackets-only strings", () => {
    expect(sanitizeGroupName("[]")).toBe("");
    expect(sanitizeGroupName("[  ]")).toBe("");
  });
});
