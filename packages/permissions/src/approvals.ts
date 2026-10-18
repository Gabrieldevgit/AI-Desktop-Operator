import { createHash, randomUUID } from "node:crypto";
import type { Action } from "@dts/shared";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashAction(action: Action): string {
  return createHash("sha256").update(canonical(action)).digest("hex");
}

export interface ApprovalAuditEntry {
  at: number;
  approvalId: string;
  actionType: Action["type"];
  outcome: "granted" | "consumed" | "expired" | "mismatch" | "unknown" | "revoked";
}

/**
 * Single-use approvals bound to the exact action. Granting is only reachable from the
 * trusted UI path in the main process. Models and renderer content never receive a handle.
 * Audit entries hold the action type only, never typed text or coordinates.
 */
export class ApprovalStore {
  private approvals = new Map<string, { hash: string; expiresAt: number; type: Action["type"] }>();
  readonly audit: ApprovalAuditEntry[] = [];

  constructor(
    private readonly now: () => number = Date.now,
    private readonly defaultTtlMs = 60_000,
  ) {}

  grant(action: Action, ttlMs = this.defaultTtlMs): string {
    const id = randomUUID();
    this.approvals.set(id, {
      hash: hashAction(action),
      expiresAt: this.now() + ttlMs,
      type: action.type,
    });
    this.log(id, action.type, "granted");
    return id;
  }

  consume(action: Action, approvalId: string | undefined): boolean {
    if (!approvalId) return false;
    const entry = this.approvals.get(approvalId);
    if (!entry) {
      this.log(approvalId, action.type, "unknown");
      return false;
    }
    this.approvals.delete(approvalId); // single use, even on failure
    if (this.now() > entry.expiresAt) {
      this.log(approvalId, action.type, "expired");
      return false;
    }
    if (entry.hash !== hashAction(action)) {
      this.log(approvalId, action.type, "mismatch");
      return false;
    }
    this.log(approvalId, action.type, "consumed");
    return true;
  }

  revokeAll(): void {
    for (const [id, e] of this.approvals) this.log(id, e.type, "revoked");
    this.approvals.clear();
  }

  private log(
    approvalId: string,
    actionType: Action["type"],
    outcome: ApprovalAuditEntry["outcome"],
  ) {
    this.audit.push({ at: this.now(), approvalId, actionType, outcome });
  }
}
