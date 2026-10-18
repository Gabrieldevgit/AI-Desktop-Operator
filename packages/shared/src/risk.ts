export type RiskLevel = "low" | "medium" | "high";
export type PolicyDecision = "allow" | "require_approval" | "deny";

export interface PolicyResult {
  decision: PolicyDecision;
  risk: RiskLevel;
  reason: string;
}
