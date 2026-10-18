import { describe, expect, it } from "vitest";
import { routeModel, type ModelProfile, type PrivacyPreferences } from "../src";

const nemotron: ModelProfile = {
  id: "nvidia/nemotron-3.5-super-vl-120b-a12b",
  provider: "nvidia",
  location: "cloud",
  vision: true,
  toolCalling: true,
  structuredOutput: true,
  maxContextTokens: 128000,
  verified: true,
  available: true,
};
const localText: ModelProfile = {
  id: "local-text",
  provider: "ollama",
  location: "local",
  vision: false,
  toolCalling: true,
  structuredOutput: true,
  maxContextTokens: 32000,
  verified: true,
  available: true,
};
const prefs = (over: Partial<PrivacyPreferences> = {}): PrivacyPreferences => ({
  localOnly: false,
  cloudConsent: { screenshots: true, text: true },
  cloudFallbackOnLocalFailure: false,
  ...over,
});
const models = [nemotron, localText];
const base = { networkAvailable: true };

describe("model router", () => {
  it("local-only never routes to cloud, even for vision", () => {
    const r = routeModel(models, "hybrid", prefs({ localOnly: true }), {
      ...base,
      needsVision: true,
    });
    expect(r.ok).toBe(false);
  });
  it("hybrid sends visual tasks to cloud when consent exists", () => {
    const r = routeModel(models, "hybrid", prefs(), { ...base, needsVision: true });
    expect(r.ok && r.model.id).toBe(nemotron.id);
  });
  it("hybrid without screenshot consent does not upload; no capable local vision model -> error", () => {
    const r = routeModel(
      models,
      "hybrid",
      prefs({ cloudConsent: { screenshots: false, text: true } }),
      { ...base, needsVision: true },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("cloud_consent_missing");
  });
  it("hybrid keeps text-only tasks local when cloud is not permitted", () => {
    const r = routeModel(
      models,
      "hybrid",
      prefs({ cloudConsent: { screenshots: false, text: false } }),
      { ...base, needsVision: false, complex: true },
    );
    expect(r.ok && r.model.location).toBe("local");
  });
  it("a failed local model does not auto-escalate to cloud", () => {
    const r = routeModel(models, "local_first", prefs(), {
      ...base,
      needsVision: false,
      localFailed: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("fallback_requires_consent");
  });
  it("fallback works once explicitly enabled", () => {
    const r = routeModel(models, "local_first", prefs({ cloudFallbackOnLocalFailure: true }), {
      ...base,
      needsVision: false,
      localFailed: true,
    });
    expect(r.ok && r.model.location).toBe("cloud");
  });
  it("ignores unverified or unavailable models", () => {
    const r = routeModel([{ ...nemotron, verified: false }], "cloud_assisted", prefs(), {
      ...base,
      needsVision: true,
    });
    expect(r.ok).toBe(false);
  });
  it("respects cost limits and offline state", () => {
    const cost = routeModel(models, "cloud_assisted", prefs(), {
      ...base,
      needsVision: true,
      estimatedCostUsd: 5,
      costLimitUsd: 1,
    });
    expect(cost.ok).toBe(false);
    const offline = routeModel(models, "cloud_assisted", prefs(), {
      needsVision: true,
      networkAvailable: false,
    });
    expect(offline.ok).toBe(false);
  });
});
