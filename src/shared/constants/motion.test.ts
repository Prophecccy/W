import { describe, it, expect } from "vitest";
import {
  SPRING_LAYOUT,
  SPRING_MODAL,
  SPRING_POP,
  SPRING_TACTILE,
} from "./motion";

describe("Motion Spring Constants", () => {
  it("defines critically damped layout spring physics", () => {
    expect(SPRING_LAYOUT.type).toBe("spring");
    expect(SPRING_LAYOUT.stiffness).toBe(380);
    expect(SPRING_LAYOUT.damping).toBe(32);
    expect(SPRING_LAYOUT.mass).toBe(1);
  });

  it("defines modal spring physics for interruptible dialogs", () => {
    expect(SPRING_MODAL.type).toBe("spring");
    expect(SPRING_MODAL.stiffness).toBe(420);
    expect(SPRING_MODAL.damping).toBe(32);
    expect(SPRING_MODAL.mass).toBe(0.9);
  });

  it("defines high-frequency zero-wobble tactile and pop springs", () => {
    expect(SPRING_TACTILE.stiffness).toBe(520);
    expect(SPRING_POP.stiffness).toBe(580);
    expect(SPRING_TACTILE.damping).toBe(30);
    expect(SPRING_POP.damping).toBe(26);
  });
});
