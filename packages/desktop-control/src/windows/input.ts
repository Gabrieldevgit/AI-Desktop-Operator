import { parseCombo } from "./keymap";

/** Platform-neutral description of one low-level input event. */
export type InputEvent =
  | { kind: "key"; vk: number; up: boolean }
  | { kind: "unicode"; codeUnit: number; up: boolean }
  | { kind: "mouse_move"; x: number; y: number } // physical pixels, virtual-desktop space
  | { kind: "mouse_button"; button: "left" | "right" | "middle"; up: boolean }
  | { kind: "mouse_wheel"; delta: number };

export interface Point {
  x: number;
  y: number;
}

/** Key-down for modifiers then key, then key-up in reverse order. */
export function comboEvents(combo: string): InputEvent[] {
  const { modifiers, key } = parseCombo(combo);
  const events: InputEvent[] = [];
  for (const m of modifiers) events.push({ kind: "key", vk: m, up: false });
  if (key !== null) {
    events.push({ kind: "key", vk: key, up: false });
    events.push({ kind: "key", vk: key, up: true });
  }
  for (const m of [...modifiers].reverse()) events.push({ kind: "key", vk: m, up: true });
  return events;
}

/** One down/up pair per UTF-16 code unit, sent as Unicode input so layout does not matter. */
export function textEvents(text: string): InputEvent[][] {
  const groups: InputEvent[][] = [];
  for (let i = 0; i < text.length; i++) {
    const codeUnit = text.charCodeAt(i);
    groups.push([
      { kind: "unicode", codeUnit, up: false },
      { kind: "unicode", codeUnit, up: true },
    ]);
  }
  return groups;
}

/** Evenly spaced waypoints from a to b, ending exactly on b. */
export function pathPoints(a: Point, b: Point, maxStepPx = 40): Point[] {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / maxStepPx));
  const pts: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    pts.push({
      x: Math.round(a.x + ((b.x - a.x) * i) / steps),
      y: Math.round(a.y + ((b.y - a.y) * i) / steps),
    });
  }
  return pts;
}

/**
 * Tracks everything currently held down so releaseInputs() can undo exactly that.
 * Updated only from events actually handed to the OS.
 */
export class HeldInputs {
  private keys = new Set<number>();
  private buttons = new Set<"left" | "right" | "middle">();

  apply(e: InputEvent): void {
    if (e.kind === "key") {
      if (e.up) this.keys.delete(e.vk);
      else this.keys.add(e.vk);
    } else if (e.kind === "mouse_button") {
      if (e.up) this.buttons.delete(e.button);
      else this.buttons.add(e.button);
    }
  }

  get isEmpty(): boolean {
    return this.keys.size === 0 && this.buttons.size === 0;
  }

  /** Release events for everything held. Does not clear state; apply() does that. */
  releaseEvents(): InputEvent[] {
    const out: InputEvent[] = [];
    for (const b of this.buttons) out.push({ kind: "mouse_button", button: b, up: true });
    for (const vk of this.keys) out.push({ kind: "key", vk, up: true });
    return out;
  }
}

/** Win32 absolute mouse coordinates span 0..65535 across the virtual desktop. */
export function toAbsolute(
  p: Point,
  vs: { x: number; y: number; width: number; height: number },
): Point {
  const nx = Math.round(((p.x - vs.x) * 65535) / Math.max(1, vs.width - 1));
  const ny = Math.round(((p.y - vs.y) * 65535) / Math.max(1, vs.height - 1));
  return { x: Math.min(65535, Math.max(0, nx)), y: Math.min(65535, Math.max(0, ny)) };
}
