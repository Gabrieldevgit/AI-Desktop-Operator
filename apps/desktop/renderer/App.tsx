import { useEffect, useState } from "react";
import type { StatusDto } from "../preload/preload";

export function App() {
  const [status, setStatus] = useState<StatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<StatusDto>) =>
    fn()
      .then(setStatus)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void run(() => window.dts.getStatus());
  }, []);

  const state = !status
    ? "Connecting"
    : !status.authorized
      ? "Not authorized"
      : status.userControlled
        ? "You are in control"
        : "AI session authorized";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>DTS Live Desktop Operator</h1>
          <p className="muted">Version {status?.version ?? "..."} - Phase 0 foundation</p>
        </div>
        <button
          className="btn danger"
          disabled={!status?.authorized || status.userControlled}
          onClick={() => run(() => window.dts.takeControl())}
        >
          Take Control
        </button>
      </header>

      <section className="card">
        <h2>Desktop control</h2>
        <dl className="grid">
          <dt>Status</dt>
          <dd>{state}</dd>
          <dt>Platform adapter</dt>
          <dd>
            {status?.platform === "simulated"
              ? "Simulated (Windows adapter not implemented yet)"
              : "Windows"}
          </dd>
          <dt>Inference</dt>
          <dd>No model connected</dd>
        </dl>
        <div className="actions">
          {!status?.authorized && (
            <button className="btn primary" onClick={() => run(() => window.dts.authorize())}>
              Authorize desktop control
            </button>
          )}
          {status?.authorized && status.userControlled && (
            <button className="btn primary" onClick={() => run(() => window.dts.resume())}>
              Allow AI to resume
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
