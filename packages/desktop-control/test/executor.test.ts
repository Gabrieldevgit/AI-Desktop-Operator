import { describe, expect, it } from "vitest";
import { ApprovalStore } from "@dts/permissions";
import type { Action } from "@dts/shared";
import { ActionExecutor, MockPlatform, newProposal } from "../src";

function setup() {
  const platform = new MockPlatform();
  const approvals = new ApprovalStore();
  const executor = new ActionExecutor({ platform, approvals, actionTimeoutMs: 500 });
  return { platform, approvals, executor };
}
const move: Action = { type: "move_mouse", x: 100, y: 100 };

describe("executor", () => {
  it("rejects everything before authorization", async () => {
    const { executor, platform } = setup();
    const r = await executor.submit(newProposal(move), { epoch: executor.currentEpoch });
    expect(r.status).toBe("cancelled");
    expect(platform.inputCalls()).toHaveLength(0);
  });

  it("executes an allowed action after authorization", async () => {
    const { executor, platform } = setup();
    const epoch = executor.authorize();
    const r = await executor.submit(newProposal(move), { epoch });
    expect(r.status).toBe("executed");
    expect(platform.inputCalls()).toEqual([{ method: "moveMouse", args: [100, 100] }]);
  });

  it("rejects invalid model output at the executor boundary", async () => {
    const { executor, platform } = setup();
    const epoch = executor.authorize();
    const bad = {
      id: "x",
      source: "model",
      action: { type: "run_shell", command: "calc" },
    } as never;
    const r = await executor.submit(bad, { epoch });
    expect(r.status).toBe("rejected");
    expect(platform.calls).toHaveLength(0);
  });

  it("takeover blocks new actions", async () => {
    const { executor, platform } = setup();
    const epoch = executor.authorize();
    await executor.takeControl();
    const r = await executor.submit(newProposal(move), { epoch });
    expect(r.status).toBe("cancelled");
    expect(platform.inputCalls()).toHaveLength(0);
    expect(platform.releaseCount).toBeGreaterThan(0);
  });

  it("a delayed model response proposed before takeover is not replayed after resume", async () => {
    const { executor, platform } = setup();
    const staleEpoch = executor.authorize();
    await executor.takeControl();
    const fresh = executor.resume();
    expect(fresh).not.toBe(staleEpoch);
    const r = await executor.submit(newProposal(move), { epoch: staleEpoch });
    expect(r.status).toBe("cancelled");
    expect(platform.inputCalls()).toHaveLength(0);
  });

  it("takeover cancels queued actions and aborts the one in flight", async () => {
    const { executor, platform } = setup();
    let open!: () => void;
    platform.gate = new Promise<void>((res) => (open = res));
    const epoch = executor.authorize();
    const first = executor.submit(newProposal(move), { epoch });
    const second = executor.submit(newProposal({ type: "move_mouse", x: 5, y: 5 }), { epoch });
    await new Promise((r) => setTimeout(r, 20)); // first is now blocked inside the platform
    await executor.takeControl();
    const [a, b] = await Promise.all([first, second]);
    open();
    expect(a.status).toBe("cancelled");
    expect(b.status).toBe("cancelled");
    expect(platform.inputCalls()).toHaveLength(0);
    expect(platform.releaseCount).toBeGreaterThan(0);
  });

  it("high-risk actions need a matching single-use approval", async () => {
    const { executor, approvals, platform } = setup();
    const epoch = executor.authorize();
    const action: Action = { type: "press_key", combo: "alt+f4" };
    const denied = await executor.submit(newProposal(action), { epoch });
    expect(denied.status).toBe("needs_approval");
    expect(platform.inputCalls()).toHaveLength(0);

    const approvalId = approvals.grant(action);
    const ok = await executor.submit(newProposal(action), { epoch, approvalId });
    expect(ok.status).toBe("executed");

    const replay = await executor.submit(newProposal(action), { epoch, approvalId });
    expect(replay.status).toBe("needs_approval");
  });

  it("takeover revokes outstanding approvals", async () => {
    const { executor, approvals } = setup();
    executor.authorize();
    const action: Action = { type: "press_key", combo: "alt+f4" };
    const approvalId = approvals.grant(action);
    await executor.takeControl();
    expect(approvals.consume(action, approvalId)).toBe(false);
  });

  it("re-checks the active window right before dispatch", async () => {
    const { executor, platform } = setup();
    const epoch = executor.authorize();
    platform.activeWindow = { title: "PowerShell", processName: "powershell.exe" }; // unexpected focus change
    const r = await executor.submit(newProposal({ type: "type_text", text: "del *" }), { epoch });
    expect(r.status).toBe("needs_approval");
    expect(platform.inputCalls()).toHaveLength(0);
  });

  it("times out stuck platform calls and reports failure", async () => {
    const { executor, platform } = setup();
    platform.gate = new Promise<void>(() => undefined);
    const epoch = executor.authorize();
    const r = await executor.submit(newProposal(move), { epoch });
    expect(r.status).toBe("failed");
  });

  it("enforces the per-session action limit", async () => {
    const platform = new MockPlatform();
    const executor = new ActionExecutor({
      platform,
      approvals: new ApprovalStore(),
      maxActionsPerSession: 2,
    });
    const epoch = executor.authorize();
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await executor.submit(newProposal(move), { epoch }));
    expect(results.map((r) => r.status)).toEqual(["executed", "executed", "rejected"]);
  });

  it("returns a screenshot for capture_screen", async () => {
    const { executor } = setup();
    const epoch = executor.authorize();
    const r = await executor.submit(newProposal({ type: "capture_screen" }), { epoch });
    expect(r.status).toBe("executed");
    expect(r.screenshot?.width).toBe(1920);
  });
});
