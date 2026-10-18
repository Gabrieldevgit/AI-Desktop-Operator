import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isTerminal,
  parseAction,
  TASK_STATES,
} from "../src";

describe("task state machine", () => {
  it("allows the standard loop", () => {
    expect(canTransition("idle", "planning")).toBe(true);
    expect(canTransition("planning", "executing")).toBe(true);
    expect(canTransition("executing", "verifying")).toBe(true);
    expect(canTransition("verifying", "completed")).toBe(true);
  });
  it("rejects skipping verification straight to completed", () => {
    expect(canTransition("executing", "completed")).toBe(false);
    expect(() => assertTransition("executing", "completed")).toThrow(InvalidTransitionError);
  });
  it("terminal states have no exits", () => {
    for (const s of ["completed", "failed", "cancelled"] as const) {
      expect(isTerminal(s)).toBe(true);
      for (const t of TASK_STATES) expect(canTransition(s, t)).toBe(false);
    }
  });
  it("user_controlled cannot jump straight to executing", () => {
    expect(canTransition("user_controlled", "executing")).toBe(false);
    expect(canTransition("user_controlled", "planning")).toBe(true);
  });
});

describe("parseAction", () => {
  it("accepts valid actions and applies defaults", () => {
    const r = parseAction({ type: "click_mouse", x: 10, y: 20 });
    expect(r.ok && r.action.type === "click_mouse" && r.action.button).toBe("left");
  });
  it("rejects unknown action types such as shell commands", () => {
    expect(parseAction({ type: "run_shell", command: "del /s *" }).ok).toBe(false);
  });
  it("rejects out-of-range and oversized input", () => {
    expect(parseAction({ type: "move_mouse", x: -1, y: 5 }).ok).toBe(false);
    expect(parseAction({ type: "type_text", text: "a".repeat(2001) }).ok).toBe(false);
  });
});
