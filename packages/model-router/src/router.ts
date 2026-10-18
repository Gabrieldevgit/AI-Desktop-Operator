export type ModelLocation = "local" | "cloud";
export type OperatingMode = "local_first" | "hybrid" | "cloud_assisted";

export interface ModelProfile {
  id: string;
  provider: string;
  location: ModelLocation;
  vision: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  maxContextTokens: number;
  /** True only after the capability test passed against the real endpoint or runtime. */
  verified: boolean;
  available: boolean;
}

export interface PrivacyPreferences {
  localOnly: boolean;
  cloudConsent: { screenshots: boolean; text: boolean };
  /** Explicit opt-in: allow escalating to cloud after a local model failed. */
  cloudFallbackOnLocalFailure: boolean;
}

export interface RouteRequest {
  needsVision: boolean;
  networkAvailable: boolean;
  estimatedCostUsd?: number;
  costLimitUsd?: number;
  localFailed?: boolean;
  /** Complex planning or visual reasoning that a local model is unlikely to handle. */
  complex?: boolean;
}

export type RouteErrorCode =
  | "no_capable_model"
  | "local_only_blocks_cloud"
  | "cloud_consent_missing"
  | "fallback_requires_consent"
  | "network_unavailable"
  | "cost_limit_exceeded";

export type RouteResult =
  | { ok: true; model: ModelProfile; reasons: string[] }
  | { ok: false; code: RouteErrorCode; message: string };

const capable = (m: ModelProfile, r: RouteRequest) =>
  m.available && m.verified && m.toolCalling && m.structuredOutput && (!r.needsVision || m.vision);

type CloudCheck = { ok: true } | { ok: false; code: RouteErrorCode; message: string };

function cloudAllowed(prefs: PrivacyPreferences, r: RouteRequest): CloudCheck {
  if (prefs.localOnly)
    return { ok: false, code: "local_only_blocks_cloud", message: "Local-only mode is on." };
  if (!r.networkAvailable)
    return { ok: false, code: "network_unavailable", message: "No network connection." };
  const consent = r.needsVision ? prefs.cloudConsent.screenshots : prefs.cloudConsent.text;
  if (!consent) {
    return {
      ok: false,
      code: "cloud_consent_missing",
      message: `Cloud inference needs consent to send ${r.needsVision ? "screenshots" : "text"}.`,
    };
  }
  if (r.costLimitUsd !== undefined && (r.estimatedCostUsd ?? 0) > r.costLimitUsd) {
    return {
      ok: false,
      code: "cost_limit_exceeded",
      message: "Estimated cost exceeds the configured limit.",
    };
  }
  if (r.localFailed && !prefs.cloudFallbackOnLocalFailure) {
    return {
      ok: false,
      code: "fallback_requires_consent",
      message: "Local model failed. Cloud fallback needs explicit permission.",
    };
  }
  return { ok: true };
}

/**
 * Deterministic, conservative routing. Never picks a cloud model without consent for the
 * data category involved, and never escalates from a failed local model on its own.
 */
export function routeModel(
  models: readonly ModelProfile[],
  mode: OperatingMode,
  prefs: PrivacyPreferences,
  req: RouteRequest,
): RouteResult {
  const local = models.find((m) => m.location === "local" && capable(m, req));
  const cloud = models.find((m) => m.location === "cloud" && capable(m, req));

  const useLocal = (why: string): RouteResult =>
    local
      ? { ok: true, model: local, reasons: [why] }
      : {
          ok: false,
          code: "no_capable_model",
          message: "No verified local model supports this task.",
        };

  const useCloud = (why: string): RouteResult => {
    if (!cloud)
      return {
        ok: false,
        code: "no_capable_model",
        message: "No verified cloud model supports this task.",
      };
    const check = cloudAllowed(prefs, req);
    if (!check.ok) return check;
    return { ok: true, model: cloud, reasons: [why] };
  };

  if (prefs.localOnly) return useLocal("Local-only preference.");

  switch (mode) {
    case "local_first": {
      if (!req.localFailed && local) return useLocal("Local-first mode.");
      // Local unavailable or failed: cloud only through the explicit fallback path.
      const failedReq = { ...req, localFailed: true };
      const check = cloud ? cloudAllowed(prefs, failedReq) : undefined;
      if (check && !check.ok) return check;
      return cloud
        ? { ok: true, model: cloud, reasons: ["Local unavailable; permitted cloud fallback."] }
        : useLocal("Local-first mode.");
    }
    case "hybrid": {
      if (req.complex || req.needsVision) {
        const attempt = useCloud("Hybrid mode: complex or visual task routed to cloud.");
        if (attempt.ok) return attempt;
        // Cloud was not permitted. Using local is not a privacy escalation.
        if (local && !req.localFailed)
          return { ok: true, model: local, reasons: [`Cloud not used: ${attempt.message}`] };
        return attempt;
      }
      return local && !req.localFailed
        ? useLocal("Hybrid mode: simple task kept local.")
        : useCloud("Hybrid mode: local unavailable.");
    }
    case "cloud_assisted": {
      const attempt = useCloud("Cloud-assisted mode.");
      if (attempt.ok) return attempt;
      if (local && !req.localFailed)
        return { ok: true, model: local, reasons: [`Cloud not used: ${attempt.message}`] };
      return attempt;
    }
  }
}
