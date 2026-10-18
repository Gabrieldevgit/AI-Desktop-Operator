# Architecture

## Pipeline

User request -> classify -> plan -> observe -> propose action -> policy -> approval (if required)
-> execute -> observe -> verify -> continue or stop.

A model only ever produces an `ActionProposal`. It never holds a handle to the platform, the
approval store, or any OS API.

## Packages

| Package                  | Responsibility                                                          | Status  |
| ------------------------ | ----------------------------------------------------------------------- | ------- |
| `@dts/shared`            | Action schemas (zod), task state machine, event bus, risk types         | Done    |
| `@dts/permissions`       | `evaluatePolicy` (pure), `ApprovalStore` (single-use, action-hash bound) | Done    |
| `@dts/desktop-control`   | `DesktopPlatform` interface, `ActionExecutor`, `MockPlatform`           | Done    |
| `@dts/model-router`      | Capability and consent aware model selection                            | Done    |
| `apps/desktop`           | Electron main, preload bridge, React renderer                           | Shell   |
| `ai-providers` (planned) | Nemotron and local adapters behind one interface                        | Phase 2 |
| `agent-core` (planned)   | Observe-plan-act-verify loop, limits, verification                      | Phase 2 |
| `database` (planned)     | Prisma schema, Supabase integration                                     | Phase 4 |

Packages export TypeScript source directly. Apps bundle them with esbuild or Vite.

## Takeover design

The executor owns an `epoch` counter. Every proposal carries the epoch it was created under.
`takeControl()` sets `userControlled`, increments the epoch, revokes approvals, aborts every
in-flight `AbortController`, and calls `releaseInputs()`. Authorization, epoch, and policy are
re-checked after a fresh active-window observation and again immediately before dispatch.
A delayed model response proposed under an old epoch is cancelled, never replayed.

Takeover uses no network and no model.

## Known gap

The emergency stop currently lives in the main process. A separately managed safety component
that survives a hung main process (and a global hotkey) is a Phase 1 requirement.
