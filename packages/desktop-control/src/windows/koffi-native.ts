import type { ActiveWindow } from "@dts/permissions";
import type { InputEvent, Point } from "./input";
import { toAbsolute } from "./input";
import type { VirtualScreen, Win32Native } from "./native";

/**
 * Real Win32 binding via koffi. UNVERIFIED: written against the koffi 2.x API and the Win32
 * documentation, never executed on Windows by its author. The Windows integration suite
 * (DTS_DESKTOP_TESTS=1) is the proof. Loaded lazily so non-Windows tooling never imports koffi.
 *
 * Packaging note: under Electron, koffi's prebuilt binary may need to be shipped via
 * extraResources (see docs/PHASE1.md).
 */

// Minimal view of the koffi surface we use, to avoid depending on its type details.
interface KoffiLike {
  load(lib: string): { func(proto: string): (...args: unknown[]) => unknown };
  struct(name: string, fields: Record<string, unknown>): unknown;
  union(name: string, fields: Record<string, unknown>): unknown;
  sizeof(type: unknown): number;
  alloc(type: string, count: number): unknown;
}

const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;
const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_VIRTUALDESK = 0x4000;
const MOUSEEVENTF_ABSOLUTE = 0x8000;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

const BUTTON_FLAGS = {
  left: [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP],
  right: [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP],
  middle: [MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP],
} as const;

export async function createKoffiNative(): Promise<Win32Native> {
  if (process.platform !== "win32") throw new Error("The Win32 native layer only runs on Windows.");
  const koffi = (await import("koffi")).default as unknown as KoffiLike;
  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");

  const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
    dx: "long",
    dy: "long",
    mouseData: "uint32",
    dwFlags: "uint32",
    time: "uint32",
    dwExtraInfo: "uintptr_t",
  });
  const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
    wVk: "uint16",
    wScan: "uint16",
    dwFlags: "uint32",
    time: "uint32",
    dwExtraInfo: "uintptr_t",
  });
  const INPUT_UNION = koffi.union("INPUT_UNION", { mi: MOUSEINPUT, ki: KEYBDINPUT });
  const INPUT = koffi.struct("INPUT", { type: "uint32", u: INPUT_UNION });
  koffi.struct("POINT", { x: "long", y: "long" });

  const SendInput = user32.func(
    "unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)",
  );
  const GetCursorPos = user32.func("bool __stdcall GetCursorPos(_Out_ POINT *lpPoint)");
  const GetSystemMetrics = user32.func("int __stdcall GetSystemMetrics(int nIndex)");
  const GetForegroundWindow = user32.func("void *__stdcall GetForegroundWindow()");
  const GetWindowTextW = user32.func(
    "int __stdcall GetWindowTextW(void *hWnd, _Out_ void *lpString, int nMaxCount)",
  );
  const GetWindowThreadProcessId = user32.func(
    "uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *lpdwProcessId)",
  );
  const OpenProcess = kernel32.func(
    "void *__stdcall OpenProcess(uint32 dwDesiredAccess, int bInheritHandle, uint32 dwProcessId)",
  );
  const QueryFullProcessImageNameW = kernel32.func(
    "int __stdcall QueryFullProcessImageNameW(void *hProcess, uint32 dwFlags, _Out_ void *lpExeName, _Inout_ uint32 *lpdwSize)",
  );
  const CloseHandle = kernel32.func("int __stdcall CloseHandle(void *hObject)");

  const cbSize = koffi.sizeof(INPUT);

  const getVirtualScreen = (): VirtualScreen => ({
    x: GetSystemMetrics(76) as number, // SM_XVIRTUALSCREEN
    y: GetSystemMetrics(77) as number,
    width: GetSystemMetrics(78) as number,
    height: GetSystemMetrics(79) as number,
  });

  function toInput(e: InputEvent): Record<string, unknown> {
    switch (e.kind) {
      case "key":
        return {
          type: INPUT_KEYBOARD,
          u: {
            ki: {
              wVk: e.vk,
              wScan: 0,
              dwFlags: e.up ? KEYEVENTF_KEYUP : 0,
              time: 0,
              dwExtraInfo: 0,
            },
          },
        };
      case "unicode":
        return {
          type: INPUT_KEYBOARD,
          u: {
            ki: {
              wVk: 0,
              wScan: e.codeUnit,
              dwFlags: KEYEVENTF_UNICODE | (e.up ? KEYEVENTF_KEYUP : 0),
              time: 0,
              dwExtraInfo: 0,
            },
          },
        };
      case "mouse_move": {
        const abs = toAbsolute({ x: e.x, y: e.y }, getVirtualScreen());
        return {
          type: INPUT_MOUSE,
          u: {
            mi: {
              dx: abs.x,
              dy: abs.y,
              mouseData: 0,
              dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
              time: 0,
              dwExtraInfo: 0,
            },
          },
        };
      }
      case "mouse_button": {
        const [down, up] = BUTTON_FLAGS[e.button];
        return {
          type: INPUT_MOUSE,
          u: {
            mi: { dx: 0, dy: 0, mouseData: 0, dwFlags: e.up ? up : down, time: 0, dwExtraInfo: 0 },
          },
        };
      }
      case "mouse_wheel":
        return {
          type: INPUT_MOUSE,
          u: {
            mi: {
              dx: 0,
              dy: 0,
              mouseData: e.delta >>> 0, // two's complement for negative deltas
              dwFlags: MOUSEEVENTF_WHEEL,
              time: 0,
              dwExtraInfo: 0,
            },
          },
        };
    }
  }

  return {
    sendInput(event) {
      const sent = SendInput(1, toInput(event), cbSize) as number;
      if (sent !== 1) throw new Error("SendInput rejected the event (blocked by UIPI or desktop).");
    },

    getCursorPos(): Point {
      const pt: { x?: number; y?: number } = {};
      GetCursorPos(pt);
      return { x: pt.x ?? 0, y: pt.y ?? 0 };
    },

    getVirtualScreen,

    getForegroundWindow(): ActiveWindow | undefined {
      const hwnd = GetForegroundWindow();
      if (!hwnd) return undefined;

      const titleBuf = Buffer.alloc(1024);
      const titleLen = GetWindowTextW(hwnd, titleBuf, 512) as number;
      const title = titleBuf.toString("utf16le", 0, Math.max(0, titleLen) * 2);

      const pid = [0];
      GetWindowThreadProcessId(hwnd, pid);
      let processName = "";
      const proc = pid[0] ? OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid[0]) : null;
      if (proc) {
        try {
          const nameBuf = Buffer.alloc(1040);
          const size = [520];
          if (QueryFullProcessImageNameW(proc, 0, nameBuf, size)) {
            const full = nameBuf.toString("utf16le", 0, (size[0] ?? 0) * 2);
            processName = full.slice(full.lastIndexOf("\\") + 1);
          }
        } finally {
          CloseHandle(proc);
        }
      }
      // An unreadable process name must never look like an allowed one.
      return { title, processName: processName || "unknown.exe" };
    },
  };
}
