import { describe, it, expect } from "vitest";
import { TrayMenuPage } from "./TrayMenuPage";

describe("TrayMenuPage", () => {
  it("exports TrayMenuPage function component", () => {
    expect(typeof TrayMenuPage).toBe("function");
  });
});
