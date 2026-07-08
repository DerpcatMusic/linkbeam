import { describe, expect, it } from "vitest";
import {
  normalizeStepId,
  parseSkippedSteps,
  serializeSkippedSteps,
  stepComplete,
  wranglerBindingsSnippet,
  wranglerResourceCommands,
  type OnboardingStatus
} from "../src/lib/onboarding";

function baseStatus(overrides: Partial<OnboardingStatus> = {}): OnboardingStatus {
  return {
    completed: false,
    currentStep: "welcome",
    skippedSteps: [],
    bindings: { db: true, kv: true, r2: true, queue: true, analytics: false },
    secrets: {
      metaPixelId: true,
      metaAccessToken: true,
      spotifyClientId: false,
      spotifyClientSecret: false
    },
    auth: { cloudflareAccess: true, passwordAuth: false, configured: true },
    databaseMigrated: true,
    linkCount: 0,
    pixelConfigured: true,
    capiConfigured: true,
    publicBaseUrl: "https://links.example.com",
    isDev: false,
    ...overrides
  };
}

describe("onboarding helpers", () => {
  it("normalizes unknown steps to welcome", () => {
    expect(normalizeStepId("secrets")).toBe("secrets");
    expect(normalizeStepId("nope")).toBe("welcome");
  });

  it("round-trips skipped steps", () => {
    const steps = parseSkippedSteps("auth,first-link,pixel");
    expect(steps).toEqual(["auth", "first-link", "pixel"]);
    expect(serializeSkippedSteps(steps)).toBe("auth,first-link,pixel");
  });

  it("marks optional steps complete when skipped", () => {
    const status = baseStatus({ skippedSteps: ["pixel"], capiConfigured: false });
    expect(stepComplete(status, "pixel")).toBe(true);
  });

  it("requires core bindings for the resources step", () => {
    const ok = baseStatus();
    const missing = baseStatus({
      bindings: { db: true, kv: false, r2: true, queue: true, analytics: false }
    });
    expect(stepComplete(ok, "resources")).toBe(true);
    expect(stepComplete(missing, "resources")).toBe(false);
  });

  it("generates wrangler snippets with placeholders", () => {
    const snippet = wranglerBindingsSnippet({ d1Id: "abc", kvId: "def" });
    expect(snippet).toContain('"database_id": "abc"');
    expect(snippet).toContain('"id": "def"');
    expect(wranglerResourceCommands()).toContain("wrangler d1 create beamlink");
  });
});
