import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMatchKeyLabel, getMetaDatasetQuality, pickMetaEventQuality } from "../src/lib/meta-quality";

describe("meta quality", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("formats match key labels for the dashboard", () => {
    expect(formatMatchKeyLabel("ip_address")).toBe("IP");
    expect(formatMatchKeyLabel("external_id")).toBe("Ext ID");
  });

  it("returns null when pixel or token is missing", async () => {
    const env = {
      LINK_CACHE: { get: vi.fn(), put: vi.fn() },
      DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) }
    } as any;
    await expect(getMetaDatasetQuality(env)).resolves.toBeNull();
  });

  it("fetches and caches dataset quality from Meta", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      web: [
        {
          event_name: "ViewContent",
          event_match_quality: {
            composite_score: 7.4,
            match_key_feedback: [
              { identifier: "ip_address", coverage: { percentage: 99.1 } }
            ],
            diagnostics: [
              {
                name: "IPv6",
                description: "Send IPv6",
                solution: "Prefer IPv6",
                percentage: 12.5
              }
            ]
          },
          event_coverage: { percentage: 88.2 }
        }
      ]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const kv = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined)
    };
    const env = {
      META_PIXEL_ID: "123456",
      META_ACCESS_TOKEN: "token",
      META_API_VERSION: "v23.0",
      LINK_CACHE: kv,
      DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) }
    } as any;

    const quality = await getMetaDatasetQuality(env);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(kv.put).toHaveBeenCalledOnce();
    expect(quality?.events[0]).toMatchObject({
      eventName: "ViewContent",
      emqScore: 7.4,
      eventCoverage: 88.2
    });
    expect(pickMetaEventQuality(quality, "ViewContent")?.diagnostics[0].name).toBe("IPv6");
  });
});
