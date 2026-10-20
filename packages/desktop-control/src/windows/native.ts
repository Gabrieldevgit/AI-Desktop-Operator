import type { ActiveWindow } from "@dts/permissions";
import type { InputEvent, Point } from "./input";

/** Rectangle of the whole virtual desktop in physical pixels. */
export interface VirtualScreen {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The only surface that talks to the OS. The real implementation (koffi + Win32) lives in
 * koffi-native.ts. Tests use a fake. Nothing above this layer imports FFI.
 */
export interface Win32Native {
  /** Hand exactly one event to the OS. Throws if the OS rejected it. */
  sendInput(event: InputEvent): void;
  getCursorPos(): Point;
  getVirtualScreen(): VirtualScreen;
  getForegroundWindow(): ActiveWindow | undefined;
}
