import type { ActiveWindow } from "@dts/permissions";
import type { DesktopPlatform, DisplayInfo, Screenshot } from "../platform";
import { comboEvents, HeldInputs, pathPoints, textEvents, type InputEvent } from "./input";
import type { Win32Native } from "./native";

/** Supplied by the Electron main process (screen API). Keeps this package free of Electron. */
export interface DisplayProvider {
  getDisplays(): Promise<DisplayInfo[]>;
}

/** Supplied by the Electron main process (desktopCapturer). */
export interface CaptureProvider {
  capture(displayId: string | undefined, signal: AbortSignal): Promise<Screenshot>;
}

export interface WindowsPlatformOptions {
  native: Win32Native;
  displays: DisplayProvider;
  capture: CaptureProvider;
  /** Delay between pointer steps. Gives the OS and the user time to see motion. */
  stepDelayMs?: number;
  /** Test seam. Must reject when the signal aborts. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export class ReleaseFailedError extends Error {
  constructor(public readonly failed: number) {
    super(`Failed to release ${failed} held input(s).`);
    this.name = "ReleaseFailedError";
  }
}

function abortError(): Error {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

/**
 * Real-input adapter for Windows. UNVERIFIED on hardware: the logic here is covered by tests
 * against a fake Win32Native, but SendInput behavior must be confirmed by the Windows
 * integration suite.
 *
 * Invariants:
 *  - one OS event per call, with an abort check before each, so a takeover lands within one event
 *  - everything handed to the OS is recorded in a ledger
 *  - any failure or abort releases whatever is still held before the error propagates
 *  - coordinates are physical pixels in virtual-desktop space (see docs/PHASE1.md)
 */
export class WindowsPlatform implements DesktopPlatform {
  private readonly held = new HeldInputs();
  private readonly native: Win32Native;
  private readonly stepDelayMs: number;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;

  constructor(private readonly opts: WindowsPlatformOptions) {
    this.native = opts.native;
    this.stepDelayMs = opts.stepDelayMs ?? 4;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  getDisplays(): Promise<DisplayInfo[]> {
    return this.opts.displays.getDisplays();
  }

  async getActiveWindow(): Promise<ActiveWindow | undefined> {
    return this.native.getForegroundWindow();
  }

  async captureScreen(displayId: string | undefined, signal: AbortSignal): Promise<Screenshot> {
    throwIfAborted(signal);
    return this.opts.capture.capture(displayId, signal);
  }

  async moveMouse(x: number, y: number, signal: AbortSignal): Promise<void> {
    await this.guarded(async () => this.glide(x, y, signal));
  }

  async clickMouse(
    x: number,
    y: number,
    button: "left" | "right" | "middle",
    double: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    await this.guarded(async () => {
      await this.glide(x, y, signal);
      for (let i = 0; i < (double ? 2 : 1); i++) {
        throwIfAborted(signal);
        this.send({ kind: "mouse_button", button, up: false });
        await this.sleep(this.stepDelayMs, signal);
        this.send({ kind: "mouse_button", button, up: true });
      }
    });
  }

  async scrollMouse(x: number, y: number, deltaY: number, signal: AbortSignal): Promise<void> {
    await this.guarded(async () => {
      await this.glide(x, y, signal);
      throwIfAborted(signal);
      // DOM convention in (positive = down). Win32 wheel is positive = up, so negate.
      this.send({ kind: "mouse_wheel", delta: -deltaY });
    });
  }

  async pressKey(combo: string, signal: AbortSignal): Promise<void> {
    const events = comboEvents(combo); // parse first: an unsupported key sends nothing
    await this.guarded(async () => {
      for (const e of events) {
        throwIfAborted(signal);
        this.send(e);
      }
    });
  }

  async typeText(text: string, signal: AbortSignal): Promise<void> {
    const groups = textEvents(text);
    await this.guarded(async () => {
      for (const group of groups) {
        throwIfAborted(signal);
        for (const e of group) this.send(e);
      }
    });
  }

  /** Release everything still held. Attempts all releases even if some fail. */
  async releaseInputs(): Promise<void> {
    let failed = 0;
    for (const e of this.held.releaseEvents()) {
      try {
        this.send(e);
      } catch {
        failed++;
      }
    }
    if (failed > 0) throw new ReleaseFailedError(failed);
  }

  /** True when nothing is held down. Exposed for tests and diagnostics. */
  get isIdle(): boolean {
    return this.held.isEmpty;
  }

  private send(e: InputEvent): void {
    this.native.sendInput(e);
    this.held.apply(e); // only after the OS accepted it
  }

  private async glide(x: number, y: number, signal: AbortSignal): Promise<void> {
    const from = this.native.getCursorPos();
    for (const p of pathPoints(from, { x, y })) {
      throwIfAborted(signal);
      this.send({ kind: "mouse_move", x: p.x, y: p.y });
      await this.sleep(this.stepDelayMs, signal);
    }
  }

  /** Run an operation; on any failure or abort, release held inputs before rethrowing. */
  private async guarded(op: () => Promise<void>): Promise<void> {
    try {
      await op();
    } catch (err) {
      await this.releaseInputs().catch(() => undefined);
      throw err;
    }
  }
}
