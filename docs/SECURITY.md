# Security

## Threat assumptions

1. Model output is untrusted. It is schema-validated and policy-checked locally, twice.
2. Screen content (web pages, documents, dialogs) is untrusted and can contain prompt injection.
   No on-screen text can grant approval. Approvals are minted only by the trusted UI path.
3. The renderer is untrusted relative to the main process. IPC senders are verified and the
   preload exposes a fixed set of methods, no generic channel.
4. Provider credentials stay in the main process. They are never sent to the renderer.

## Implemented controls (tested)

- Unknown action types (shell, PowerShell, scripts) fail schema validation.
- Blocked combos (Ctrl+Alt+Delete) are denied under any spelling.
- Terminal windows, sign-in/payment windows, out-of-scope windows, and destructive keys require approval.
- Approvals are single-use, expire, and are bound to a hash of the exact action.
- Takeover revokes outstanding approvals and invalidates queued and delayed actions.
- Audit log stores action types and outcomes, not typed text or coordinates.

## Electron settings (in code, not yet launch-tested)

Context isolation on, sandbox on, Node integration off, CSP with no network, navigation and
window-open restricted.

## Not done yet

Real platform adapter, global emergency hotkey, hung-renderer stop channel, credential store,
code signing and update verification, dependency and adversarial test suites on real hardware.
