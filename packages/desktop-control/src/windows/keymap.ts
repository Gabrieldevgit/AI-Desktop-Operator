/** Windows virtual-key codes for the keys the policy layer can reason about. */

export const VK = {
  backspace: 0x08,
  tab: 0x09,
  enter: 0x0d,
  shift: 0x10,
  ctrl: 0x11,
  alt: 0x12,
  escape: 0x1b,
  space: 0x20,
  pageup: 0x21,
  pagedown: 0x22,
  end: 0x23,
  home: 0x24,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  insert: 0x2d,
  delete: 0x2e,
  win: 0x5b,
} as const;

export const MODIFIERS = ["win", "ctrl", "alt", "shift"] as const;
type Modifier = (typeof MODIFIERS)[number];

const ALIASES: Record<string, string> = {
  control: "ctrl",
  cmd: "win",
  meta: "win",
  super: "win",
  windows: "win",
  del: "delete",
  esc: "escape",
  return: "enter",
  pgup: "pageup",
  pgdn: "pagedown",
};

export class UnsupportedKeyError extends Error {
  constructor(key: string) {
    super(`Unsupported key: "${key}"`);
    this.name = "UnsupportedKeyError";
  }
}

function keyToVk(name: string): number {
  if (name in VK) return VK[name as keyof typeof VK];
  if (/^[a-z]$/.test(name)) return name.toUpperCase().charCodeAt(0); // VK_A..VK_Z
  if (/^[0-9]$/.test(name)) return name.charCodeAt(0); // VK_0..VK_9
  const f = /^f([1-9]|1[0-2])$/.exec(name);
  if (f?.[1]) return 0x70 + Number(f[1]) - 1; // VK_F1..VK_F12
  throw new UnsupportedKeyError(name);
}

export interface ParsedCombo {
  modifiers: number[]; // virtual-key codes, in press order
  key: number | null; // null for a modifier-only combo such as "win"
}

/** "Ctrl + Alt+Del" -> modifiers [ctrl, alt], key delete. Throws UnsupportedKeyError. */
export function parseCombo(combo: string): ParsedCombo {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ALIASES[p] ?? p);
  if (parts.length === 0) throw new UnsupportedKeyError(combo);

  const mods = new Set<Modifier>();
  const keys: string[] = [];
  for (const p of parts) {
    if ((MODIFIERS as readonly string[]).includes(p)) mods.add(p as Modifier);
    else keys.push(p);
  }
  if (keys.length > 1) throw new UnsupportedKeyError(keys.join("+"));

  const modifiers = MODIFIERS.filter((m) => mods.has(m)).map((m) => VK[m]);
  const key = keys[0] === undefined ? null : keyToVk(keys[0]);
  return { modifiers, key };
}
