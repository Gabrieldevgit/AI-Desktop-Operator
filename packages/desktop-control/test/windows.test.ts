import { describe, expect, it } from "vitest";
import {
  comboEvents,
  HeldInputs,
  pathPoints,
  parseCombo,
  ReleaseFailedError,
  textEvents,
  toAbsolute,
  UnsupportedKeyError,
  VK,
  WindowsPlatform,
  type InputEvent,
  type Point,
  type Win32Native,
} from "../src";

class FakeNative implements Win32Native {
  sent: InputEvent[] = [];
  cursor: Point = { x: 0, y: 0 };
  failOn?: (e: InputEvent) => boolean;
  sendInput(e: InputEvent) {
    if (this.failOn?.(e)) throw new Error("rejected");
    this.sent.push(e);
    if (e.kind === "mouse_move") this.cursor = { x: e.x, y: e.y };
  }
  getCursorPos() {
    return this.cursor;
  }
  getVirtualScreen() {
    return { x: 0, y: 0, width: 1920, height: 1080 };
  }
  getForegroundWindow() {
    return { title: "Safe Test App", processName: "dts-test-app.exe" };
  }
}

function make(opts: { sleep?: (ms: number, s: AbortSignal) => Promise<void> } = {}) {
  const native = new FakeNative();
  const platform = new WindowsPlatform({
    native,
    displays: { getDisplays: async () => [{ id: "d0", width: 1920, height: 1080 }] },
    capture: {
      capture: async () => ({ displayId: "d0", width: 1, height: 1, png: new Uint8Array() }),
    },
    sleep: opts.sleep ?? (async () => undefined),
  });
  return { native, platform };
}

const never = new AbortController().signal;

describe("keymap", () => {
  it("parses modifiers and key regardless of spelling and order", () => {
    expect(parseCombo("Control + Shift + a")).toEqual({
      modifiers: [VK.ctrl, VK.shift],
      key: "A".charCodeAt(0),
    });
    expect(parseCombo("DEL").key).toBe(VK.delete);
    expect(parseCombo("f12").key).toBe(0x7b);
    expect(parseCombo("win")).toEqual({ modifiers: [VK.win], key: null });
  });
  it("rejects unknown keys and multi-key chords", () => {
    expect(() => parseCombo("ctrl+banana")).toThrow(UnsupportedKeyError);
    expect(() => parseCombo("a+b")).toThrow(UnsupportedKeyError);
  });
});

describe("input sequencing", () => {
  it("presses modifiers then key, and releases in reverse", () => {
    const ev = comboEvents("ctrl+shift+a");
    expect(ev.map((e) => (e.kind === "key" ? `${e.up ? "u" : "d"}${e.vk}` : "?"))).toEqual([
      `d${VK.ctrl}`,
      `d${VK.shift}`,
      `d65`,
      `u65`,
      `u${VK.shift}`,
      `u${VK.ctrl}`,
    ]);
  });
  it("emits one down/up pair per UTF-16 code unit", () => {
    expect(textEvents("hi")).toHaveLength(2);
    expect(textEvents("\u{1F600}")).toHaveLength(2); // surrogate pair
  });
  it("path always ends exactly on the target", () => {
    const pts = pathPoints({ x: 0, y: 0 }, { x: 399, y: 201 });
    expect(pts.at(-1)).toEqual({ x: 399, y: 201 });
    expect(pathPoints({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual([{ x: 5, y: 5 }]);
  });
  it("normalizes absolute coordinates to 0..65535 and clamps", () => {
    const vs = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(toAbsolute({ x: 0, y: 0 }, vs)).toEqual({ x: 0, y: 0 });
    expect(toAbsolute({ x: 1919, y: 1079 }, vs)).toEqual({ x: 65535, y: 65535 });
    expect(toAbsolute({ x: 99999, y: -5 }, vs)).toEqual({ x: 65535, y: 0 });
  });
  it("ledger tracks held inputs and produces matching releases", () => {
    const h = new HeldInputs();
    h.apply({ kind: "key", vk: VK.ctrl, up: false });
    h.apply({ kind: "mouse_button", button: "left", up: false });
    expect(h.isEmpty).toBe(false);
    expect(h.releaseEvents()).toHaveLength(2);
    h.apply({ kind: "key", vk: VK.ctrl, up: true });
    h.apply({ kind: "mouse_button", button: "left", up: true });
    expect(h.isEmpty).toBe(true);
  });
});

describe("WindowsPlatform", () => {
  it("moves the cursor to the exact target", async () => {
    const { native, platform } = make();
    await platform.moveMouse(300, 200, never);
    expect(native.cursor).toEqual({ x: 300, y: 200 });
    expect(platform.isIdle).toBe(true);
  });

  it("clicks with down then up and leaves nothing held", async () => {
    const { native, platform } = make();
    await platform.clickMouse(10, 10, "left", true, never);
    const buttons = native.sent.filter((e) => e.kind === "mouse_button");
    expect(buttons.map((b) => (b.kind === "mouse_button" ? b.up : null))).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(platform.isIdle).toBe(true);
  });

  it("presses a combo and leaves nothing held", async () => {
    const { native, platform } = make();
    await platform.pressKey("ctrl+a", never);
    expect(native.sent).toHaveLength(4);
    expect(platform.isIdle).toBe(true);
  });

  it("an unsupported key sends nothing at all", async () => {
    const { native, platform } = make();
    await expect(platform.pressKey("ctrl+banana", never)).rejects.toThrow(UnsupportedKeyError);
    expect(native.sent).toHaveLength(0);
  });

  it("abort mid-glide stops within one event and holds nothing", async () => {
    const ac = new AbortController();
    let steps = 0;
    const { native, platform } = make({
      sleep: async () => {
        if (++steps === 3) ac.abort();
      },
    });
    await expect(platform.moveMouse(1500, 900, ac.signal)).rejects.toThrow("Aborted");
    expect(native.sent.length).toBeLessThanOrEqual(3);
    expect(platform.isIdle).toBe(true);
  });

  it("abort between button-down and button-up releases the button", async () => {
    const ac = new AbortController();
    const { native, platform } = make({
      sleep: async (_ms, s) => {
        // the pointer is already there; the first sleep after button-down is the click hold
        if (native.sent.some((e) => e.kind === "mouse_button" && !e.up)) ac.abort();
        if (s.aborted) throw new Error("Aborted");
      },
    });
    native.cursor = { x: 50, y: 50 };
    await expect(platform.clickMouse(50, 50, "left", false, ac.signal)).rejects.toThrow();
    const last = native.sent.at(-1);
    expect(last).toEqual({ kind: "mouse_button", button: "left", up: true });
    expect(platform.isIdle).toBe(true);
  });

  it("abort mid-combo releases held modifiers", async () => {
    const ac = new AbortController();
    const { native, platform } = make();
    const origSend = native.sendInput.bind(native);
    native.sendInput = (e) => {
      origSend(e);
      if (e.kind === "key" && e.vk === VK.shift && !e.up) ac.abort();
    };
    await expect(platform.pressKey("ctrl+shift+a", ac.signal)).rejects.toThrow("Aborted");
    expect(platform.isIdle).toBe(true);
    expect(native.sent.filter((e) => e.kind === "key" && e.up)).toHaveLength(2);
  });

  it("abort mid-text stops typing", async () => {
    const ac = new AbortController();
    const { native, platform } = make();
    const origSend = native.sendInput.bind(native);
    let n = 0;
    native.sendInput = (e) => {
      origSend(e);
      if (++n === 6) ac.abort();
    };
    await expect(platform.typeText("abcdefgh", ac.signal)).rejects.toThrow("Aborted");
    expect(native.sent.length).toBeLessThan(16);
    expect(platform.isIdle).toBe(true);
  });

  it("releaseInputs frees held keys and is idempotent", async () => {
    const { native, platform } = make();
    native.failOn = (e) => e.kind === "key" && e.up && e.vk === VK.ctrl; // release fails once
    await expect(platform.pressKey("ctrl+a", never)).rejects.toThrow();
    expect(platform.isIdle).toBe(false); // ctrl still held: the OS refused the release
    native.failOn = undefined;
    await platform.releaseInputs();
    expect(platform.isIdle).toBe(true);
    await platform.releaseInputs(); // second call is a harmless no-op
  });

  it("reports failed releases instead of hiding them", async () => {
    const { native, platform } = make();
    native.failOn = (e) => e.kind === "key" && e.up && e.vk === VK.ctrl;
    await expect(platform.pressKey("ctrl+a", never)).rejects.toThrow();
    // the OS still refuses to release ctrl: an explicit release must surface that
    await expect(platform.releaseInputs()).rejects.toThrow(ReleaseFailedError);
    expect(platform.isIdle).toBe(false);
  });

  it("scroll negates DOM direction into Win32 wheel direction", async () => {
    const { native, platform } = make();
    await platform.scrollMouse(5, 5, 120, never);
    expect(native.sent.at(-1)).toEqual({ kind: "mouse_wheel", delta: -120 });
  });

  it("delegates displays, capture, and active window", async () => {
    const { platform } = make();
    expect(await platform.getDisplays()).toHaveLength(1);
    expect((await platform.captureScreen(undefined, never)).displayId).toBe("d0");
    expect((await platform.getActiveWindow())?.processName).toBe("dts-test-app.exe");
  });
});
