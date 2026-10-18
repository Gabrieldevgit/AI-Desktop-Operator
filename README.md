# DTS Live Desktop Operator

Local-first, hybrid AI desktop operator with real computer control and immediate human takeover.
Windows first. Built by Developpement Team Studios (DTS).

## Current status: Phase 0 (foundation)

What exists and is verified by automated tests (run in a Linux sandbox, mocked platform):

- Strict TypeScript monorepo (npm workspaces), ESLint, Prettier, Vitest, GitHub Actions
- `@dts/shared`: zod action schemas, task state machine with enforced transitions, typed event bus
- `@dts/permissions`: pure policy engine (allow / require approval / deny) and single-use approval store
- `@dts/desktop-control`: platform interface, serialized executor with epoch-based takeover, and a mock platform
- `@dts/model-router`: capability-aware, consent-aware routing (local-first, hybrid, cloud-assisted)
- `apps/desktop`: Electron shell (context isolation, sandbox, CSP, validated IPC) and React UI with Take Control

What does NOT exist yet (do not assume it works):

- Real Windows input, screen capture, or UI Automation (Phase 1)
- Any model integration, including the NVIDIA Nemotron adapter and local inference (Phases 2 and 3)
- Supabase and Prisma (Phase 4)
- The Electron app has been bundled but never launched; no Electron binary or display was available in the build sandbox
- A committed `package-lock.json`. CI uses `npm install` for now. Run `npm install` locally, commit the lockfile, then switch CI to `npm ci`

## Quick start

```bash
npm install
npm run ci        # format, lint, typecheck, test, build
npm run start     # builds and launches the Electron shell (needs a desktop session)
```

Copy `.env.example` to `.env` for local development. Never commit `.env`.

## Layout

See `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/PRIVACY.md`, `docs/DEVELOPMENT.md`, `docs/ROADMAP.md`.
