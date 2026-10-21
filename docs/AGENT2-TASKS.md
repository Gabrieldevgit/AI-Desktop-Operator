# Agent 2 task briefs (Phase 1)

Assigned by the project lead. Read `docs/PHASE1.md` first: it has the stack decision, known limitations, and the ownership table. This file is the detailed brief for items 2, 3, and 4.

## Rules that apply to every task

- Branch from `main` (or from `phase-1-windows-adapter` if the task says so). Name it `agent2/<topic>`. Open a PR. Never push to `main`.
- Do NOT modify `packages/permissions`, `packages/shared`, or `packages/desktop-control/src/executor.ts`. If you believe a change is needed there, stop and describe it in the PR instead.
- No shell, PowerShell, or arbitrary command execution reachable from model output or from anything on screen.
- `npm run ci` must pass before you open a PR.
- In every PR description, include two lists: **Verified** (with evidence: command and result) and **Not verified**. Do not claim something works because it compiles.
- Never commit credentials, screenshots, or user files.
- If a task turns out to be blocked or the spec is ambiguous, write the question in the PR or in `docs/QUESTIONS.md` and move to the next task. Do not guess on safety-relevant behavior.

---

## Task 2: Safe Test App (no dependencies, start here)

Branch: `agent2/safe-test-app`

Build a tiny Electron app that the integration suite can drive safely. It is the only app the tests are allowed to click and type into.

Requirements:

- New workspace `apps/safe-test-app` (Electron main, preload, minimal renderer). Reuse the security settings from `apps/desktop`: context isolation, sandbox, no Node in the renderer, CSP.
- Window title exactly `DTS Safe Test App`. Packaged executable name `dts-test-app.exe` (the policy engine matches on process name).
- Deterministic controls at stable positions: one text input, one button that increments a visible counter, one checkbox, one scrollable list.
- A local, read-only state readout so outcomes can be verified without a screenshot: write the current state as JSON to the path in env var `DTS_TEST_STATE_FILE` on every change. No network server, no open ports, no external IPC.
- Harmless by construction: no file deletion, no shell, no network.

Done when: `npm run ci` passes, and the PR states honestly whether the app was actually launched on Windows.

---

## Task 3: Electron capture and display providers, plus desktop preview

Branch: `agent2/capture-providers`, based on `phase-1-windows-adapter` (it defines the interfaces). Wait for PR #3 to merge, or base your branch on it.

Implement, in `apps/desktop/electron/`, the two interfaces exported by `@dts/desktop-control`:

- `DisplayProvider.getDisplays()` using Electron's `screen` API
- `CaptureProvider.capture(displayId, signal)` using `desktopCapturer`

Then show the captured frame as a desktop preview in the renderer (through the existing narrow preload bridge; add one new method, validate its arguments, and do not expose a generic invoke).

Critical details:

- Coordinates in actions are **physical pixels in virtual-desktop space**. Electron reports DIPs. Convert using `scaleFactor` and document the conversion. This must be tested at 100%, 125%, and 150% scaling, or you must say plainly that you could not.
- Respect the abort signal. Screenshots stay in memory only and are never written to disk or logged.
- The preview is observational only. It must never send input.
- Distinguish the real OS cursor from any overlay drawn in the preview, as the spec requires.

Done when: `npm run ci` passes, unit tests cover the DIP-to-pixel conversion, and the PR states what was and was not verified on a real display.

---

## Task 4: Windows integration suite (opt-in)

Branch: `agent2/integration-suite`, after task 2 and PR #3 are merged.

Write tests that drive `WindowsPlatform` (real koffi Win32 layer, created with `createKoffiNative()`) against the Safe Test App:

- Skipped unless `process.platform === 'win32'` and `DTS_DESKTOP_TESTS=1`, so normal CI is unaffected.
- Cases: cursor reaches the target, click increments the counter, typing fills the input, key combo toggles the checkbox, scroll moves the list.
- Takeover case: start a long glide, abort mid-way, assert the cursor stopped near where it was and nothing is held (no key stuck, no button down).
- Failure case: send input while the test app is not focused and assert the result is detected, not silently ignored.
- State assertions come from the `DTS_TEST_STATE_FILE` readout, not from screenshots.

If `koffi-native.ts` fails on real Windows (struct layout, out-parameters, SendInput rejected), **that is the most valuable finding in this phase**. Report it precisely in the PR (error text, which call, Windows version) instead of working around it. The lead will fix the binding.

Done when: the suite runs on a real Windows machine and the PR includes the actual output, pass or fail.
