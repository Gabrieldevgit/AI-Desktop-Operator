# Development

Requirements: Node 20+ (22 recommended), Windows 10/11 for desktop-control work.

```bash
npm install                 # set ELECTRON_SKIP_BINARY_DOWNLOAD=1 to skip the Electron binary
npm run ci                  # format:check, lint, typecheck, test, build
npm test                    # vitest
npm run dev:renderer        # Vite dev server on :5173
```

Tests use `MockPlatform`. Never run destructive tests against real user files.
Use a dedicated safe test application and synthetic data for Phase 1 desktop tests.
