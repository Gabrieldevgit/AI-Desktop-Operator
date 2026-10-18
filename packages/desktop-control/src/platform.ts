import type { ActiveWindow } from "@dts/permissions";

export interface DisplayInfo {
  id: string;
  width: number;
  height: number;
}

export interface Screenshot {
  displayId: string;
  width: number;
  height: number;
  /** PNG bytes. Kept in memory only by default. */
  png: Uint8Array;
}

/**
 * Platform boundary. Windows is the first implementation (Phase 1). Every method that can
 * take time accepts an AbortSignal and must stop issuing input as soon as it aborts.
 * Nothing here is ever exposed to a model directly.
 */
export interface DesktopPlatform {
  getDisplays(): Promise<DisplayInfo[]>;
  getActiveWindow(): Promise<ActiveWindow | undefined>;
  captureScreen(displayId: string | undefined, signal: AbortSignal): Promise<Screenshot>;
  moveMouse(x: number, y: number, signal: AbortSignal): Promise<void>;
  clickMouse(
    x: number,
    y: number,
    button: "left" | "right" | "middle",
    double: boolean,
    signal: AbortSignal,
  ): Promise<void>;
  scrollMouse(x: number, y: number, deltaY: number, signal: AbortSignal): Promise<void>;
  pressKey(combo: string, signal: AbortSignal): Promise<void>;
  typeText(text: string, signal: AbortSignal): Promise<void>;
  /** Release every held key and mouse button. Must be safe to call at any time. */
  releaseInputs(): Promise<void>;
}
