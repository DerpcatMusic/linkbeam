import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionCount,
  buildCampaignPerformance,
  formatAdMoney,
  getMetaAdsInsights,
  isNumericCampaignId,
  matchesConversionAction,
  normalizeAdAccountId
} from "../src/lib/meta-ads-insights";
import { normalizeAdAccountId as normalizeFromSettings } from "../src/lib/settings";

describe("meta ads insights helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes ad account ids", () => {
    expect(normalizeAdAccountId("1234567890")).toBe("act_1234567890");
    expect(normalizeAdAccountId("act_999")).toBe("act_999");
    expect(normalizeFromSettings("bad-id")).toBeUndefined();
  });

  it("detects numeric campaign ids", () => {
    expect(isNumericCampaignId("120252485014960416")).toBe(true);
    expect(isNumericCampaignId("smoke")).toBe(false);
  });

  it("matches conversion actions for ViewContent", () => {
    expect(matchesConversionAction("offsite_conversion.fb_pixel_view_content", "ViewContent")).toBe(true);
    expect(matchesConversionAction("link_click", "ViewContent")).toBe(false);
    expect(actionCount([
      { action_type: "offsite_conversion.fb_pixel_view_content", value: "12" },
      { action_type: "link_click", value: "40" }
    ], "ViewContent")).toBe(12);
  });

  it("merges local taps with meta spend and resolves display names", () => {
    const rows = buildCampaignPerformance(
      [
        { campaignKey: "120252485014960416", campaignId: "120252485014960416", nameHint: "", count: 6 },
        { campaignKey: "smoke", campaignId: "", nameHint: "smoke", count: 3 }
      ],
      {
        fetchedAt: "2026-07-07T12:00:00.000Z",
        currency: "USD",
        campaigns: [{
          campaignId: "120252485014960416",
          campaignName: "Summer Drop",
          spend: 42.5,
          impressions: 12000,
          clicks: 90,
          metaResults: 5,
          costPerResult: 8.5
        }]
      },
      new Map()
    );

    expect(rows[0]).toMatchObject({
      displayName: "Summer Drop",
      yourTaps: 6,
      spend: 42.5,
      costPerYourTap: 42.5 / 6
    });
    expect(rows[1]).toMatchObject({ displayName: "smoke", yourTaps: 3, spend: null });
  });

  it("formats ad money", () => {
    expect(formatAdMoney(12.4, "USD")).toBe("$12.40");
    expect(formatAdMoney(null, "USD")).toBe("—");
  });

  it("fetches and caches campaign insights", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      data: [{
        campaign_id: "120252485014960416",
        campaign_name: "Summer Drop",
        spend: "18.20",
        impressions: "4000",
        clicks: "32",
        actions: [{ action_type: "offsite_conversion.fb_pixel_view_content", value: "4" }],
        cost_per_action_type: [{ action_type: "offsite_conversion.fb_pixel_view_content", value: "4.55" }]
      }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const kv = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined)
    };
    const env = {
      META_AD_ACCOUNT_ID: "act_123",
      META_ACCESS_TOKEN: "token",
      META_API_VERSION: "v23.0",
      META_CURRENCY: "USD",
      LINK_CACHE: kv,
      DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) }
    } as any;

    const insights = await getMetaAdsInsights(env, 7, "ViewContent");
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(kv.put).toHaveBeenCalledOnce();
    expect(insights?.campaigns[0]).toMatchObject({
      campaignId: "120252485014960416",
      campaignName: "Summer Drop",
      spend: 18.2,
      metaResults: 4
    });
  });
});
