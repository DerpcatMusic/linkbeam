import { describe, expect, it } from "vitest";
import {
  buildDualSeriesChart,
  analyticsTableRows,
  formatChartDelta,
  getAdBreakdown,
  getBrowserBreakdown,
  getCampaignBreakdown,
  getDeviceBreakdown,
  getFunnelStats,
  getHourHeatmap,
  getHourlyTimeseries,
  getOsBreakdown,
  getReferrerBreakdown,
  normalizeAnalyticsOptions,
  referrerHost,
  sparklinePath,
  type TimeseriesPoint
} from "../src/lib/stats";
import { visitorHashFromRequest } from "../src/lib/metrics";

function series(days: number, fn: (index: number) => { views: number; clicks: number }): TimeseriesPoint[] {
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
    return { day, presaves: 0, ...fn(index) };
  });
}

describe("buildDualSeriesChart", () => {
  it("builds area and line paths for views and clicks", () => {
    const points = series(5, (index) => ({ views: (index + 1) * 10, clicks: (index + 1) * 2 }));
    const chart = buildDualSeriesChart(points, { width: 400, height: 160 });

    expect(chart.markers).toHaveLength(5);
    expect(chart.viewsLine).toMatch(/^M[\d.]+,[\d.]+/);
    expect(chart.clicksLine).toMatch(/^M[\d.]+,[\d.]+/);
    expect(chart.viewsArea).toContain("Z");
    expect(chart.clicksArea).toContain("Z");
    expect(chart.yTicks[chart.yTicks.length - 1].value).toBe(50);
  });

  it("scales y axis to the larger series peak", () => {
    const points = series(3, (index) => ({
      views: index === 1 ? 100 : 10,
      clicks: index === 1 ? 5 : 1
    }));
    const chart = buildDualSeriesChart(points, { width: 300, height: 120 });
    const peak = chart.markers[1];

    expect(peak.viewsY).toBeGreaterThanOrEqual(chart.padding.top);
    expect(peak.viewsY).toBeLessThan(chart.padding.top + 10);
    expect(peak.clicksY).toBeGreaterThan(peak.viewsY);
  });

  it("handles empty and flat series", () => {
    const empty = buildDualSeriesChart([], { width: 200, height: 100 });
    expect(empty.markers).toHaveLength(0);
    expect(empty.viewsLine).toBe("");

    const flat = buildDualSeriesChart(
      [{ day: "2026-01-01", views: 0, clicks: 0, presaves: 0 }],
      { width: 200, height: 100 }
    );
    expect(flat.markers).toHaveLength(1);
    expect(flat.viewsLine).toMatch(/^M/);
  });

  it("includes presaves, tap rate, and prior-period deltas on markers", () => {
    const points = series(3, (index) => ({
      views: [10, 20, 15][index],
      clicks: [2, 4, 6][index],
      presaves: index === 2 ? 1 : 0
    }));
    const chart = buildDualSeriesChart(points, { width: 300, height: 120 });

    expect(chart.markers[0]).toMatchObject({
      presaves: 0,
      tapRate: 0.2,
      priorViews: null,
      deltaViews: null
    });
    expect(chart.markers[1]).toMatchObject({
      deltaViews: 10,
      deltaClicks: 2,
      priorViews: 10,
      priorClicks: 2
    });
    expect(chart.markers[2].presaves).toBe(1);
    expect(formatChartDelta(chart.markers[2].deltaViews, chart.markers[2].priorViews)).toBe("-5 / -25.0%");
  });
});

describe("analytics options", () => {
  it("normalizes range, view, and unique query params", () => {
    expect(normalizeAnalyticsOptions(new URLSearchParams("range=7&view=table&unique=1"))).toEqual({
      days: 7,
      view: "table",
      unique: true,
      granularity: "daily",
      hours: 24
    });
    expect(normalizeAnalyticsOptions(new URLSearchParams("range=900&view=nope"))).toEqual({
      days: 7,
      view: "chart",
      unique: false,
      granularity: "daily",
      hours: 24
    });
    expect(normalizeAnalyticsOptions(new URLSearchParams(""))).toMatchObject({
      days: 7,
      granularity: "daily"
    });
    expect(normalizeAnalyticsOptions(new URLSearchParams("range=30"))).toMatchObject({ days: 30 });
  });

  it("parses hourly granularity and hour range", () => {
    expect(normalizeAnalyticsOptions(new URLSearchParams("granularity=hourly&hours=48"))).toMatchObject({
      granularity: "hourly",
      hours: 48
    });
    expect(normalizeAnalyticsOptions(new URLSearchParams("granularity=hourly&hours=999"))).toMatchObject({
      granularity: "hourly",
      hours: 24
    });
  });

  it("builds newest-first rows with CTR labels for server-rendered tables", () => {
    const rows = analyticsTableRows([
      { day: "2026-01-01", views: 10, clicks: 2, presaves: 1 },
      { day: "2026-01-02", views: 0, clicks: 0, presaves: 0 }
    ]);

    expect(rows).toEqual([
      { day: "2026-01-02", views: 0, clicks: 0, presaves: 0, ctrLabel: "—" },
      { day: "2026-01-01", views: 10, clicks: 2, presaves: 1, ctrLabel: "20.0%" }
    ]);
  });
});

describe("sparklinePath", () => {
  it("returns a smooth path for combined traffic", () => {
    const points = series(7, (index) => ({ views: index, clicks: index % 2 }));
    const path = sparklinePath(points, 80, 24);
    expect(path).toMatch(/^M[\d.]+,[\d.]+/);
    expect(path).toContain("C");
  });
});

describe("visitorHashFromRequest", () => {
  it("hashes _fbp cookie with SHA-256", async () => {
    const request = new Request("https://links.test/song", {
      headers: { cookie: "_fbp=fb.1.1.abc" }
    });
    const hash = await visitorHashFromRequest(request);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fb.1.1.abc"));
    const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(hash).toBe(expected);
  });

  it("returns empty string when _fbp is absent", async () => {
    const request = new Request("https://links.test/song");
    await expect(visitorHashFromRequest(request)).resolves.toBe("");
  });
});

describe("breakdown share math", () => {
  it("computes shares that sum to one", async () => {
    const rows = [
      { country: "US", count: 30 },
      { country: "GB", count: 20 },
      { country: "DE", count: 50 }
    ];
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const shares = rows.map((row) => row.count / total);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
  });
});

describe("client analytics breakdowns", () => {
  it("queries normalized device, browser, and OS breakdowns from metric events", async () => {
    const calls: Array<{ sql: string; bindings: unknown[] }> = [];
    const env = {
      DB: {
        prepare(sql: string) {
          const call = { sql, bindings: [] as unknown[] };
          calls.push(call);
          return {
            bind(...bindings: unknown[]) {
              call.bindings = bindings;
              return this;
            },
            async all() {
              if (sql.includes("device_type")) {
                return { results: [{ label: "mobile", count: 7 }, { label: "desktop", count: 3 }] };
              }
              if (sql.includes("browser_name")) {
                return { results: [{ label: "Instagram", count: 6 }, { label: "Safari", count: 4 }] };
              }
              if (sql.includes("os_name")) {
                return { results: [{ label: "iOS", count: 8 }, { label: "Windows", count: 2 }] };
              }
              return { results: [] };
            }
          };
        }
      }
    } as any;

    await expect(getDeviceBreakdown(env, "lnk_test", 30)).resolves.toEqual([
      { label: "mobile", count: 7, share: 0.7 },
      { label: "desktop", count: 3, share: 0.3 }
    ]);
    await expect(getBrowserBreakdown(env, "lnk_test", 30)).resolves.toEqual([
      { label: "Instagram", count: 6, share: 0.6 },
      { label: "Safari", count: 4, share: 0.4 }
    ]);
    await expect(getOsBreakdown(env, "lnk_test", 30)).resolves.toEqual([
      { label: "iOS", count: 8, share: 0.8 },
      { label: "Windows", count: 2, share: 0.2 }
    ]);

    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.bindings[0] === "lnk_test")).toBe(true);
  });
});

function stubDb(handlers: { first?: (sql: string) => unknown; all?: (sql: string) => unknown[] }): { env: any; calls: Array<{ sql: string; bindings: unknown[] }> } {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  const env = {
    DB: {
      prepare(sql: string) {
        const call = { sql, bindings: [] as unknown[] };
        calls.push(call);
        return {
          bind(...bindings: unknown[]) { call.bindings = bindings; return this; },
          async first() { return handlers.first ? handlers.first(sql) : null; },
          async all() { return { results: handlers.all ? handlers.all(sql) : [] }; }
        };
      }
    }
  };
  return { env, calls };
}

describe("funnel + hourly + heatmap analytics", () => {
  it("computes the funnel and tap rate from metric events", async () => {
    const { env } = stubDb({ first: () => ({ pageViews: 200, viewContents: 40 }) });
    await expect(getFunnelStats(env, "lnk_1", 30)).resolves.toEqual({
      pageViews: 200,
      viewContents: 40,
      tapRate: 0.2
    });
  });

  it("returns zero tap rate when there are no page views", async () => {
    const { env } = stubDb({ first: () => ({ pageViews: 0, viewContents: 0 }) });
    await expect(getFunnelStats(env, "lnk_1", 30)).resolves.toMatchObject({ tapRate: 0 });
  });

  it("fills every hour bucket in the requested window", async () => {
    const { env, calls } = stubDb({ all: () => [] });
    const points = await getHourlyTimeseries(env, "lnk_1", 24);
    expect(points).toHaveLength(24);
    expect(points.every((point) => point.views === 0 && point.clicks === 0)).toBe(true);
    // ISO hour buckets like "2026-07-07T14"
    expect(points[0].day).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);
    expect(calls[0].sql).toContain("substr(created_at, 1, 13)");
  });

  it("summarizes heatmap cells with peak and total", async () => {
    const { env } = stubDb({ all: () => [
      { weekday: 2, hour: 14, count: 9 },
      { weekday: 5, hour: 20, count: 3 }
    ] });
    const heatmap = await getHourHeatmap(env, "lnk_1", 30);
    expect(heatmap.max).toBe(9);
    expect(heatmap.total).toBe(12);
    expect(heatmap.cells).toHaveLength(2);
  });

  it("only counts ViewContent taps in attribution breakdowns", async () => {
    const { env, calls } = stubDb({ all: () => [{ label: "summer-drop", count: 8 }, { label: "teaser", count: 2 }] });
    await expect(getCampaignBreakdown(env, "lnk_1", 30)).resolves.toEqual([
      { label: "summer-drop", count: 8, share: 0.8 },
      { label: "teaser", count: 2, share: 0.2 }
    ]);
    expect(calls[0].sql).toContain("kind = 'click'");
    expect(calls[0].sql).toContain("utm_campaign");
    await getAdBreakdown(env, "lnk_1", 30);
    expect(calls[1].sql).toContain("ad_id");
  });

  it("aggregates referrers by host", async () => {
    const { env } = stubDb({ all: () => [
      { label: "https://www.instagram.com/p/abc", count: 5 },
      { label: "https://instagram.com/reel/xyz", count: 3 },
      { label: "https://l.facebook.com/", count: 2 }
    ] });
    const rows = await getReferrerBreakdown(env, "lnk_1", 30);
    expect(rows[0]).toEqual({ label: "instagram.com", count: 8, share: 0.8 });
    expect(rows[1]).toMatchObject({ label: "l.facebook.com", count: 2 });
  });
});

describe("referrerHost", () => {
  it("strips www and falls back gracefully", () => {
    expect(referrerHost("https://www.instagram.com/p/1")).toBe("instagram.com");
    expect(referrerHost("not a url")).toBe("not a url");
    expect(referrerHost("")).toBe("direct");
  });
});

describe("hourly chart labels", () => {
  it("formats hour buckets into readable marker labels", () => {
    const points: TimeseriesPoint[] = [
      { day: "2026-07-07T00", views: 3, clicks: 1, presaves: 0 },
      { day: "2026-07-07T13", views: 9, clicks: 4, presaves: 0 }
    ];
    const chart = buildDualSeriesChart(points, { labelFormat: "hour" });
    expect(chart.markers[0].label).toContain("Jul 7");
    expect(chart.markers[1].label).toMatch(/1\s?PM/i);
  });
});
