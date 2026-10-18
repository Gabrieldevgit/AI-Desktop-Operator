import { describe, expect, it } from "vitest";
import type { Action } from "@dts/shared";
import { ApprovalStore, evaluatePolicy, normalizeCombo, type PolicyContext } from "../src";

const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  authorized: true,
  userControlled: false,
  display: { width: 1920, height: 1080 },
  activeWindow: { title: "Notes", processName: "notepad.exe" },
  ...over,
});

describe("policy engine", () => {
  it("denies everything without authorization", () => {
    expect(
      evaluatePolicy({ type: "move_mouse", x: 1, y: 1 }, ctx({ authorized: false })).decision,
    ).toBe("deny");
  });
  it("denies while the user is in control", () => {
    expect(evaluatePolicy({ type: "capture_screen" }, ctx({ userControlled: true })).decision).toBe(
      "deny",
    );
  });
  it("denies out-of-bounds coordinates", () => {
    expect(
      evaluatePolicy({ type: "click_mouse", x: 5000, y: 5, button: "left", double: false }, ctx())
        .decision,
    ).toBe("deny");
  });
  it("blocks ctrl+alt+delete however it is spelled", () => {
    for (const combo of ["Ctrl+Alt+Del", "alt + control + delete", "DELETE+CTRL+ALT"]) {
      expect(evaluatePolicy({ type: "press_key", combo }, ctx()).decision).toBe("deny");
    }
  });
  it("requires approval for window-closing and deletion keys", () => {
    for (const combo of ["Alt+F4", "Win+R", "Del", "Shift+Delete"]) {
      expect(evaluatePolicy({ type: "press_key", combo }, ctx()).decision).toBe("require_approval");
    }
  });
  it("treats typing into a terminal as command execution", () => {
    const t = ctx({ activeWindow: { title: "PowerShell", processName: "PowerShell.exe" } });
    expect(
      evaluatePolicy({ type: "type_text", text: "Remove-Item -Recurse C:\\" }, t).decision,
    ).toBe("require_approval");
    expect(evaluatePolicy({ type: "press_key", combo: "Enter" }, t).decision).toBe(
      "require_approval",
    );
  });
  it("requires approval in sign-in or payment windows", () => {
    const t = ctx({ activeWindow: { title: "Sign in to your bank", processName: "chrome.exe" } });
    expect(evaluatePolicy({ type: "type_text", text: "hello" }, t).decision).toBe(
      "require_approval",
    );
    expect(
      evaluatePolicy({ type: "click_mouse", x: 1, y: 1, button: "left", double: false }, t)
        .decision,
    ).toBe("require_approval");
  });
  it("requires approval outside the scoped process list", () => {
    const t = ctx({ allowedProcesses: ["dts-test-app.exe"] });
    expect(evaluatePolicy({ type: "type_text", text: "x" }, t).decision).toBe("require_approval");
  });
  it("allows ordinary in-scope actions", () => {
    expect(evaluatePolicy({ type: "type_text", text: "hello" }, ctx()).decision).toBe("allow");
    expect(evaluatePolicy({ type: "move_mouse", x: 10, y: 10 }, ctx()).risk).toBe("low");
  });
  it("normalizes combos", () => {
    expect(normalizeCombo("Control + Alt + Del")).toBe("alt+ctrl+delete");
  });
});

describe("approval store", () => {
  const action: Action = { type: "press_key", combo: "alt+f4" };
  it("is single use", () => {
    const s = new ApprovalStore();
    const id = s.grant(action);
    expect(s.consume(action, id)).toBe(true);
    expect(s.consume(action, id)).toBe(false);
  });
  it("is bound to the exact action", () => {
    const s = new ApprovalStore();
    const id = s.grant(action);
    expect(s.consume({ type: "press_key", combo: "win+r" }, id)).toBe(false);
  });
  it("expires", () => {
    let now = 1000;
    const s = new ApprovalStore(() => now, 100);
    const id = s.grant(action);
    now += 101;
    expect(s.consume(action, id)).toBe(false);
  });
  it("rejects unknown ids and never logs action payloads", () => {
    const s = new ApprovalStore();
    expect(s.consume(action, "nope")).toBe(false);
    s.grant({ type: "type_text", text: "super secret" });
    expect(JSON.stringify(s.audit)).not.toContain("super secret");
  });
});
