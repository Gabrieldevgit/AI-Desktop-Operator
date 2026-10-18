import type { ActiveWindow } from "@dts/permissions";
import type { DesktopPlatform, DisplayInfo, Screenshot } from "./platform";

export interface MockCall {
  method: string;
  args: unknown[];
}

/** In-memory platform for deterministic tests. It never touches a real desktop. */
export class MockPlatform implements DesktopPlatform {
  calls: MockCall[] = [];
  releaseCount = 0;
  activeWindow: ActiveWindow | undefined = {
    title: "Safe Test App",
    processName: "dts-test-app.exe",
  };
  display: DisplayInfo = { id: "display-0", width: 1920, height: 1080 };
  /** If set, input methods wait on this promise, simulating a slow OS call. Honors abort. */
  gate?: Promise<void>;

  private async slow(signal: AbortSignal): Promise<void> {
    if (!this.gate) return;
    await Promise.race([
      this.gate,
      new Promise<void>((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
      ),
    ]);
  }
  private record(method: string, ...args: unknown[]) {
    this.calls.push({ method, args });
  }

  async getDisplays() {
    return [this.display];
  }
  async getActiveWindow() {
    return this.activeWindow;
  }
  async captureScreen(displayId: string | undefined, _s: AbortSignal): Promise<Screenshot> {
    this.record("captureScreen", displayId);
    return {
      displayId: displayId ?? this.display.id,
      width: this.display.width,
      height: this.display.height,
      png: new Uint8Array([137, 80, 78, 71]),
    };
  }
  async moveMouse(x: number, y: number, s: AbortSignal) {
    await this.slow(s);
    this.record("moveMouse", x, y);
  }
  async clickMouse(x: number, y: number, b: string, d: boolean, s: AbortSignal) {
    await this.slow(s);
    this.record("clickMouse", x, y, b, d);
  }
  async scrollMouse(x: number, y: number, dy: number, s: AbortSignal) {
    await this.slow(s);
    this.record("scrollMouse", x, y, dy);
  }
  async pressKey(combo: string, s: AbortSignal) {
    await this.slow(s);
    this.record("pressKey", combo);
  }
  async typeText(text: string, s: AbortSignal) {
    await this.slow(s);
    this.record("typeText", text);
  }
  async releaseInputs() {
    this.releaseCount++;
  }
  inputCalls(): MockCall[] {
    return this.calls.filter((c) => c.method !== "captureScreen");
  }
}
