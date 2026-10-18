import { randomUUID } from "node:crypto";
import type { Action, ActionProposal, PolicyResult } from "@dts/shared";
import { ActionSchema } from "@dts/shared";
import { evaluatePolicy, type ApprovalStore, type PolicyContext } from "@dts/permissions";
import type { DesktopPlatform, Screenshot } from "./platform";

export type ExecutionStatus = "executed" | "rejected" | "needs_approval" | "cancelled" | "failed";

export interface ExecutionResult {
  proposalId: string;
  status: ExecutionStatus;
  reason: string;
  policy?: PolicyResult;
  screenshot?: Screenshot;
}

export interface SubmitOptions {
  /** Epoch captured when the proposal was created. A takeover invalidates it. */
  epoch: number;
  approvalId?: string;
}

export interface ExecutorOptions {
  platform: DesktopPlatform;
  approvals: ApprovalStore;
  actionTimeoutMs?: number;
  maxActionsPerSession?: number;
}

/**
 * The only component allowed to issue AI-controlled desktop input.
 *
 * Safety state lives here, not in the UI:
 *  - actions run one at a time through a serialized queue
 *  - every submission carries an epoch; takeControl() bumps the epoch and aborts everything
 *  - the epoch, authorization, and policy are re-checked immediately before dispatch,
 *    with a fresh active-window observation
 *  - a delayed model response that arrives after takeover is rejected, never replayed
 *
 * Stopping AI input does not undo what an application already did.
 */
export class ActionExecutor {
  private epoch = 0;
  private authorized = false;
  private userControlled = false;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly inflight = new Set<AbortController>();
  private actionCount = 0;
  private readonly timeoutMs: number;
  private readonly maxActions: number;

  constructor(private readonly opts: ExecutorOptions) {
    this.timeoutMs = opts.actionTimeoutMs ?? 10_000;
    this.maxActions = opts.maxActionsPerSession ?? 500;
  }

  get currentEpoch(): number {
    return this.epoch;
  }
  get isUserControlled(): boolean {
    return this.userControlled;
  }
  get isAuthorized(): boolean {
    return this.authorized;
  }

  /** Called only from the trusted UI path after explicit user consent. */
  authorize(): number {
    this.authorized = true;
    this.userControlled = false;
    this.actionCount = 0;
    this.epoch++;
    return this.epoch;
  }

  /** End the session. Same invalidation as takeover. */
  async revoke(): Promise<void> {
    this.authorized = false;
    await this.invalidate();
  }

  /** Take Control. Local only. Works with no network and no model. */
  async takeControl(): Promise<void> {
    this.userControlled = true;
    await this.invalidate();
  }

  /** User chose to resume. Returns the fresh epoch that new proposals must carry. */
  resume(): number {
    if (!this.authorized) throw new Error("Cannot resume without an authorized session.");
    this.userControlled = false;
    this.epoch++;
    return this.epoch;
  }

  submit(proposal: ActionProposal, options: SubmitOptions): Promise<ExecutionResult> {
    const controller = new AbortController();
    this.inflight.add(controller);
    const run = () =>
      this.run(proposal, options, controller).finally(() => this.inflight.delete(controller));
    // Keep the chain alive regardless of individual outcomes.
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async invalidate(): Promise<void> {
    this.epoch++;
    this.opts.approvals.revokeAll();
    for (const c of this.inflight) c.abort();
    try {
      await this.opts.platform.releaseInputs();
    } catch {
      /* best effort; the platform adapter must also release on abort */
    }
  }

  private async buildContext(): Promise<PolicyContext> {
    const [displays, activeWindow] = await Promise.all([
      this.opts.platform.getDisplays(),
      this.opts.platform.getActiveWindow(),
    ]);
    const d = displays[0] ?? { width: 0, height: 0 };
    return {
      authorized: this.authorized,
      userControlled: this.userControlled,
      display: { width: d.width, height: d.height },
      activeWindow,
    };
  }

  private stale(options: SubmitOptions, signal: AbortSignal): boolean {
    return (
      signal.aborted || options.epoch !== this.epoch || !this.authorized || this.userControlled
    );
  }

  private async run(
    proposal: ActionProposal,
    options: SubmitOptions,
    controller: AbortController,
  ): Promise<ExecutionResult> {
    const id = proposal.id;
    const out = (
      status: ExecutionStatus,
      reason: string,
      policy?: PolicyResult,
    ): ExecutionResult => ({
      proposalId: id,
      status,
      reason,
      policy,
    });
    const { signal } = controller;

    try {
      if (this.stale(options, signal))
        return out("cancelled", "Session state changed before dispatch.");

      // Re-validate even though the caller should have. Model output is untrusted.
      const parsed = ActionSchema.safeParse(proposal.action);
      if (!parsed.success) return out("rejected", "Action failed schema validation.");
      const action: Action = parsed.data;

      if (this.actionCount >= this.maxActions)
        return out("rejected", "Action limit reached for this session.");

      // Fresh observation immediately before the decision.
      const ctx = await this.buildContext();
      if (this.stale(options, signal))
        return out("cancelled", "Session state changed during observation.");

      const policy = evaluatePolicy(action, ctx);
      if (policy.decision === "deny") return out("rejected", policy.reason, policy);
      if (policy.decision === "require_approval") {
        if (!this.opts.approvals.consume(action, options.approvalId)) {
          return out("needs_approval", policy.reason, policy);
        }
      }

      // Last gate before real input.
      if (this.stale(options, signal))
        return out("cancelled", "Session state changed after approval.", policy);

      this.actionCount++;
      const screenshot = await this.dispatch(action, signal);

      if (signal.aborted) {
        await this.opts.platform.releaseInputs().catch(() => undefined);
        return out(
          "cancelled",
          "Interrupted during execution. The application may have partially acted.",
          policy,
        );
      }
      return { ...out("executed", "Action dispatched.", policy), screenshot };
    } catch (err) {
      if (signal.aborted) {
        await this.opts.platform.releaseInputs().catch(() => undefined);
        return out("cancelled", "Interrupted during execution.");
      }
      return out("failed", err instanceof Error ? err.message : "Unknown executor error.");
    }
  }

  private async dispatch(action: Action, signal: AbortSignal): Promise<Screenshot | undefined> {
    const p = this.opts.platform;
    const timeout = new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error("Action timed out.")), this.timeoutMs);
      signal.addEventListener("abort", () => clearTimeout(t), { once: true });
    });
    const work = (async (): Promise<Screenshot | undefined> => {
      switch (action.type) {
        case "capture_screen":
          return p.captureScreen(action.displayId, signal);
        case "move_mouse":
          return void (await p.moveMouse(action.x, action.y, signal));
        case "click_mouse":
          return void (await p.clickMouse(
            action.x,
            action.y,
            action.button,
            action.double,
            signal,
          ));
        case "scroll_mouse":
          return void (await p.scrollMouse(action.x, action.y, action.deltaY, signal));
        case "press_key":
          return void (await p.pressKey(action.combo, signal));
        case "type_text":
          return void (await p.typeText(action.text, signal));
      }
    })();
    return Promise.race([work, timeout]);
  }
}

export function newProposal(
  action: Action,
  source: ActionProposal["source"] = "model",
  rationale?: string,
): ActionProposal {
  return { id: randomUUID(), source, action, rationale };
}
