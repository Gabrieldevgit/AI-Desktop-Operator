import type { Action, PolicyResult } from "@dts/shared";

export interface ActiveWindow {
  title: string;
  processName: string;
}

export interface PolicyContext {
  /** User has explicitly authorized a desktop-control session. */
  authorized: boolean;
  /** User has taken control. AI input is always denied while true. */
  userControlled: boolean;
  display: { width: number; height: number };
  activeWindow?: ActiveWindow;
  /** If set, actions outside these processes need approval. */
  allowedProcesses?: readonly string[];
}

const TERMINAL_PROCESSES = new Set([
  "cmd.exe",
  "powershell.exe",
  "pwsh.exe",
  "windowsterminal.exe",
  "wt.exe",
  "conhost.exe",
  "bash.exe",
  "wsl.exe",
]);

const SENSITIVE_TITLE =
  /(password|sign[ -]?in|log[ -]?in|credential|payment|checkout|bank|2fa|otp)/i;

/** Never allowed from the AI, regardless of approval. */
const BLOCKED_COMBOS = new Set(["ctrl+alt+delete", "ctrl+shift+escape"]);

/** Allowed only with immediate, single-use approval. */
const HIGH_RISK_COMBOS = new Set([
  "alt+f4",
  "win+r",
  "win+x",
  "ctrl+shift+delete",
  "shift+delete",
  "delete",
  "ctrl+w",
  "ctrl+shift+n",
]);

const KEY_ALIASES: Record<string, string> = {
  control: "ctrl",
  cmd: "win",
  meta: "win",
  super: "win",
  windows: "win",
  del: "delete",
  esc: "escape",
  return: "enter",
};

/** Normalize "Ctrl + Alt+Del" into "alt+ctrl+delete" so lookups cannot be dodged by spelling. */
export function normalizeCombo(combo: string): string {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => KEY_ALIASES[p] ?? p);
  const modifiers = parts.filter((p) => ["ctrl", "alt", "shift", "win"].includes(p));
  const keys = parts.filter((p) => !["ctrl", "alt", "shift", "win"].includes(p));
  return [...new Set(modifiers)].sort().concat(keys).join("+");
}

function normalizedSet(combos: Set<string>): Set<string> {
  return new Set([...combos].map(normalizeCombo));
}
const BLOCKED = normalizedSet(BLOCKED_COMBOS);
const HIGH = normalizedSet(HIGH_RISK_COMBOS);

function inBounds(x: number, y: number, d: PolicyContext["display"]): boolean {
  return x >= 0 && y >= 0 && x < d.width && y < d.height;
}

function isTerminal(w?: ActiveWindow): boolean {
  return !!w && TERMINAL_PROCESSES.has(w.processName.toLowerCase());
}

function outOfScope(ctx: PolicyContext): boolean {
  if (!ctx.allowedProcesses || !ctx.activeWindow) return false;
  const p = ctx.activeWindow.processName.toLowerCase();
  return !ctx.allowedProcesses.some((a) => a.toLowerCase() === p);
}

const deny = (reason: string): PolicyResult => ({ decision: "deny", risk: "high", reason });
const approve = (reason: string): PolicyResult => ({
  decision: "require_approval",
  risk: "high",
  reason,
});
const allow = (risk: "low" | "medium", reason: string): PolicyResult => ({
  decision: "allow",
  risk,
  reason,
});

/**
 * Pure policy evaluation. Runs locally for every proposal regardless of which model
 * produced it. Model rationale is never an input.
 */
export function evaluatePolicy(action: Action, ctx: PolicyContext): PolicyResult {
  if (!ctx.authorized) return deny("Desktop control has not been authorized by the user.");
  if (ctx.userControlled) return deny("User has taken control.");

  // Observation never mutates state.
  if (action.type === "capture_screen")
    return allow("low", "Screen capture within an authorized session.");

  if ("x" in action && !inBounds(action.x, action.y, ctx.display)) {
    return deny("Coordinates are outside the display bounds.");
  }

  // Anything that changes state while the wrong window is focused needs a human.
  if (outOfScope(ctx)) {
    return approve(`Active window (${ctx.activeWindow?.processName}) is outside the task scope.`);
  }

  switch (action.type) {
    case "move_mouse":
    case "scroll_mouse":
      return allow("low", "Pointer movement or scroll within bounds.");

    case "click_mouse":
      if (ctx.activeWindow && SENSITIVE_TITLE.test(ctx.activeWindow.title)) {
        return approve(
          "Clicking in a window that looks like a sign-in, payment, or security surface.",
        );
      }
      return allow("medium", "Click within bounds.");

    case "press_key": {
      const combo = normalizeCombo(action.combo);
      if (BLOCKED.has(combo)) return deny(`Key combination ${combo} is blocked for AI input.`);
      if (HIGH.has(combo))
        return approve(`Key combination ${combo} can close windows or delete data.`);
      if (isTerminal(ctx.activeWindow) && combo === "enter") {
        return approve("Pressing Enter in a terminal can execute a command.");
      }
      return allow("low", "Ordinary key press.");
    }

    case "type_text":
      if (isTerminal(ctx.activeWindow)) {
        return approve("Typing into a terminal is equivalent to running commands.");
      }
      if (ctx.activeWindow && SENSITIVE_TITLE.test(ctx.activeWindow.title)) {
        return approve(
          "Typing into a window that looks like a sign-in, payment, or security surface.",
        );
      }
      return allow("medium", "Text entry in an in-scope window.");
  }
}
