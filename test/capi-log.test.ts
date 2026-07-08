import { describe, expect, it } from "vitest";
import {
  analyzeCapiMatchKeys,
  parseCapiLogView,
  type CapiLogRow
} from "../src/lib/capi-log";

function capiRow(overrides: Partial<CapiLogRow> = {}): CapiLogRow {
  return {
    id: "cap_1",
    event_id: "evt_1",
    link_id: "lnk_1",
    kind: "click",
    status: "sent",
    http_status: 200,
    meta_trace_id: "trace_1",
    error_message: null,
    attempt: 1,
    payload: JSON.stringify({
      eventName: "ViewContent",
      platform: "spotify",
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      fbp: "fb.1.1.1",
      fbc: "fb.1.2.3",
      externalId: "abc123",
      hashedCountry: "hash",
      hashedCity: "hash",
      hashedState: "hash",
      attribution: { utmCampaign: "release", utmSource: "meta", adId: "ad1" }
    }),
    created_at: "2026-07-07T12:00:00.000Z",
    ...overrides
  };
}

describe("capi log helpers", () => {
  it("parses payload into event, platform, attribution, and match keys", () => {
    const view = parseCapiLogView(capiRow());
    expect(view.eventName).toBe("ViewContent");
    expect(view.platform).toBe("spotify");
    expect(view.attribution).toContain("release");
    expect(view.matchKeys).toEqual(["IP", "UA", "fbp", "fbc", "ext", "country", "city", "state", "geo"]);
  });

  it("aggregates match key coverage for sent rows only", () => {
    const coverage = analyzeCapiMatchKeys([
      capiRow(),
      capiRow({ id: "cap_2", status: "failed" }),
      capiRow({
        id: "cap_3",
        payload: JSON.stringify({ eventName: "PageView", userAgent: "Mozilla/5.0" })
      })
    ]);

    expect(coverage.total).toBe(2);
    expect(coverage.userAgent).toBe(2);
    expect(coverage.ip).toBe(1);
    expect(coverage.fbp).toBe(1);
    expect(coverage.country).toBe(1);
    expect(coverage.city).toBe(1);
    expect(coverage.geo).toBe(1);
  });
});
