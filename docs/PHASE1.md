# Phase 1: Windows desktop-control foundation

Status: in progress. Project lead: Claude (this chat). See "Ownership" for the split with the second agent.

## Decision record: input and capture stack

| Option                                | Verdict                             | Why                                                                                                                                                           |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| koffi + Win32 `SendInput`             | **Chosen**                          | Maintained, widely used, no compile step. Our own thin layer gives one input ledger and an abort check before every OS event.                                 |
| nut.js (`@nut-tree/nut-js`)           | Fallback                            | Maintained and Electron-aware, abortable `type` and `move`. But it hides the input ledger that `releaseInputs()` depends on. Revisit if SendInput misbehaves. |
| Electron `desktopCapturer` + `screen` | **Chosen** for capture and displays | No native dependency at all. Runs in the main process.                                                                                                        |
| Windows UI Automation                 | Deferred                            | Needs a native or helper-process bridge. Phase 1 is pixel coordinates. Revisit after control and takeover are proven.                                         |
| PowerShell or shell shortcuts         | Rejected                            | Forbidden by the spec. No arbitrary command execution as a shortcut to computer control.                                                                      |

This decision rests on design fit and published changelogs, not on a benchmark. Nothing here has been run on Windows by its author.

## What exists

`packages/desktop-control/src/windows/`:

- `keymap.ts`: key-combo parser (virtual-key codes). Unknown keys throw, and send nothing.
- `input.ts`: pure event sequencing, pointer path, absolute-coordinate math, and the `HeldInputs` ledger.
- `native.ts`: the `Win32Native` interface. The only surface that touches the OS.
- `windows-platform.ts`: `WindowsPlatform implements DesktopPlatform`.
- `koffi-native.ts`: the real Win32 binding. **Unverified.**

Verified (fake native, Linux): sequencing, abort between events, release on abort or failure, idempotent release. Mutation checks confirm the tests fail if release-on-abort or the per-step abort check is removed.

NOT verified: everything that depends on real `SendInput` behavior, struct layout in `koffi-native.ts`, DPI scaling, and multi-monitor behavior.

## Known limitations (read before trusting this)

1. **Abort granularity is one OS event.** We check the abort signal before each `SendInput` call. An event already handed to the OS cannot be recalled. Take Control therefore lands within one event plus one step delay.
2. **Coordinate space.** Action coordinates are treated as physical pixels in virtual-desktop space. Electron reports DIPs. The capture provider must convert, and must be tested at 125% and 150% scaling.
3. **Policy bounds check only the primary display.** On multi-monitor setups an action on a secondary display is currently denied or mis-bounded. Fix before claiming multi-monitor support.
4. **UIPI.** `SendInput` into an elevated (administrator) window from a non-elevated process is silently blocked or rejected. The adapter surfaces rejection as an error. Do not work around it by elevating the app.
5. **koffi packaging.** Under Electron the prebuilt koffi binary may need to ship via `extraResources` (koffi's documented fallback location). Packaging is a Phase 5 task, but check it early.
6. **koffi version.** Pinned to 2.x (the API the binding was written against). A 3.x line exists and has not been evaluated.
7. **Emergency stop** still lives in the main process. A global hotkey and a stop channel that survives a hung main process are open items below.

## Ownership (project lead decides, second agent executes)

Rules for the second agent:

- Work on a branch named `agent2/<topic>`. Open a PR. Do not push to `main`.
- Do not modify `packages/permissions`, `packages/shared`, or `ActionExecutor` without a PR that explains why and adds tests. These are the safety core.
- No shell, PowerShell, or arbitrary command execution in any code path reachable from model output.
- Run `npm run ci` before every PR. State in the PR what was verified and what was not. Never claim a feature works without evidence.
- No real credentials, screenshots, or user files in the repo.

| #   | Work item                                                                                                         | Owner   | Depends on              |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------- | ----------------------- |
| 1   | Windows adapter (`WindowsPlatform`, koffi binding)                                                                | Lead    | none (done, unverified) |
| 2   | Safe Test App: tiny Electron app with deterministic controls and a local, read-only state readout for verification | Agent 2 | none                    |
| 3   | Electron capture and display providers (`CaptureProvider`, `DisplayProvider`) plus desktop preview in the renderer | Agent 2 | 1 (interfaces)          |
| 4   | Windows integration suite (opt-in via `DTS_DESKTOP_TESTS=1`): drive `WindowsPlatform` against the Safe Test App   | Agent 2 | 1, 2                    |
| 5   | Outcome verifier (compare expected vs. observed state after an action)                                            | Lead    | 2                       |
| 6   | Emergency stop: global hotkey and stop channel independent of the renderer                                        | Lead    | 1                       |
| 7   | Wire `WindowsPlatform` into `apps/desktop` main process on Windows                                                | Lead    | 1, 3                    |

## Phase 1 is done only when

1. The adapter moves the real cursor and types into the Safe Test App on Windows (integration suite passes on a real machine).
2. The preview shows the real desktop at correct scale.
3. Take Control during a long glide stops input and leaves no key or button held (tested on real input).
4. The emergency hotkey works with the renderer frozen.
5. The verifier confirms outcomes, and a deliberately failed action is detected.
6. Limitations above are either fixed or documented as still open, with evidence.
