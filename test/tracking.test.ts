import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  trackingCookies,
  fbcFromFbclid,
  generateFbp,
  getMetaCookiesToSet,
  resolveTrackingCookies,
  trackingAttribution,
  trackingQuerySuffix,
  eventIdFromRequest,
  deviceHintsFromRequest,
  clientIpFromRequest,
  hashedGeoFromRequest,
  formatTrackingCookieHeaders,
  queueMetaEvent,
  processConversionQueueBatch,
  sendMetaBatch,
  sha256Hex,
  buildPixelScript
} from "../src/lib/tracking";
import { isBot } from "../src/lib/bots";
import {
  effectiveLinkMode,
  resolveViewEventName,
  resolveClickEventName
} from "../src/lib/effective-mode";
import { buildCapiRetryQuery } from "../src/lib/capi-log";
import { getMetaAccessToken, getMetaApiVersion, getMetaCurrency, metaEventsManagerUrl } from "../src/lib/settings";
import { verifyAccessJwt, clearJwksCacheForTests } from "../src/lib/access-jwt";
import type { SmartLink } from "../src/lib/types";

function baseLink(overrides: Partial<SmartLink> = {}): SmartLink {
  return {
    id: "lnk_test",
    track_id: "trk_test",
    link_name: "Test",
    slug: "test",
    mode: "live",
    status: "published",
    view_event_name: "ViewContent",
    click_event_name: null,
    paid_click_event_name: "Stream_Click_Paid",
    spotify_open_behavior: "web",
    spotify_context_url: null,
    page_background_style: "blur",
    button_style: "monochrome",
    page_style_options: {
      blur: { intensity: 1, saturate: 1 },
      ascii: { density: "md", contrast: 0.7, motion: "live" },
      mesh: { speed: 1, intensity: 1 },
      aurora: { speed: 1, intensity: 1, blur: 1 },
      vinyl: { speed: 1, intensity: 1 }
    },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-01T00:00:00Z",
    track: {
      id: "trk_test",
      isrc: null,
      title: "Song",
      artist_id: null,
      artist_name: "Artist",
      artist_names: ["Artist"],
      artwork_url: null,
      artwork_object_key: null,
      source_url: null,
      source_provider: "manual",
      release_at: null,
      live_at: null,
      palette: null
    },
    destinations: [],
    ...overrides
  } as SmartLink;
}

describe("tracking helpers", () => {
  it("reads fbp/fbc cookies", () => {
    const request = new Request("https://links.test/song", {
      headers: { cookie: "_fbp=fb.1.1.abc; _fbc=fb.1.2.def" }
    });
    expect(trackingCookies(request)).toEqual({ fbp: "fb.1.1.abc", fbc: "fb.1.2.def" });
  });

  it("creates fbc from fbclid", () => {
    const request = new Request("https://links.test/song?fbclid=test-click");
    expect(trackingCookies(request).fbc).toContain("test-click");
  });

  it("preserves fbclid case and plus characters when creating fbc", () => {
    const request = new Request("https://links.test/song?fbclid=AbC+Click_ID");
    expect(trackingCookies(request).fbc).toMatch(/^fb\.1\.\d+\.AbC\+Click_ID$/);
  });

  it("generates _fbp when absent", () => {
    const request = new Request("https://links.test/song");
    const cookies = getMetaCookiesToSet(request);
    const fbp = cookies.find((cookie) => cookie.name === "_fbp");
    expect(fbp?.value).toMatch(/^fb\.1\.\d+\.\d+$/);
    expect(cookies.some((cookie) => cookie.name === "_dg_vid")).toBe(true);
  });

  it("generates _fbc from fbclid when absent", () => {
    const request = new Request("https://links.test/song?fbclid=abc123");
    const cookies = getMetaCookiesToSet(request);
    expect(cookies.map((c) => c.name).sort()).toEqual(["_dg_attr", "_dg_vid", "_fbc", "_fbp"]);
    expect(cookies.find((c) => c.name === "_fbc")?.value).toContain("abc123");
  });

  it("encodes _fbc Set-Cookie values without changing the fbclid sent to CAPI", () => {
    const request = new Request("https://links.test/song?fbclid=AbC+X%3BY%2FZ");
    const fbcCookie = getMetaCookiesToSet(request).find((cookie) => cookie.name === "_fbc");
    expect(fbcCookie?.value).toMatch(/^fb\.1\.\d+\.AbC\+X;Y\/Z$/);

    const setCookie = formatTrackingCookieHeaders(request, [fbcCookie!])[0];
    expect(setCookie).toContain("AbC%2BX%3BY%2FZ");

    const outbound = new Request("https://links.test/out/song/spotify", {
      headers: { cookie: setCookie.slice(0, setCookie.indexOf(";")) }
    });
    expect(trackingCookies(outbound).fbc).toBe(fbcCookie?.value);
  });

  it("does not regenerate existing cookies", () => {
    const request = new Request("https://links.test/song?fbclid=abc", {
      headers: { cookie: "_fbp=fb.1.1.keep; _fbc=fb.1.2.abc; _dg_vid=dg.1.keep" }
    });
    expect(getMetaCookiesToSet(request).map((cookie) => cookie.name)).toEqual(["_dg_attr"]);
  });

  it("refreshes _fbc when a new fbclid arrives", () => {
    const request = new Request("https://links.test/song?fbclid=new-click", {
      headers: { cookie: "_fbp=fb.1.1.keep; _fbc=fb.1.2.old-click; _dg_vid=dg.1.keep" }
    });
    const cookies = getMetaCookiesToSet(request);
    expect(cookies.map((cookie) => cookie.name).sort()).toEqual(["_dg_attr", "_fbc"]);
    expect(cookies.find((cookie) => cookie.name === "_fbc")?.value).toMatch(/^fb\.1\.\d+\.new-click$/);
  });

  it("merges generated cookies for first-visit CAPI", () => {
    const request = new Request("https://links.test/song?fbclid=abc123");
    const generated = getMetaCookiesToSet(request);
    expect(resolveTrackingCookies(request, generated).fbp).toMatch(/^fb\.1\.\d+\.\d+$/);
    expect(resolveTrackingCookies(request, generated).fbc).toContain("abc123");
    expect(resolveTrackingCookies(request, generated).externalId).toMatch(/^dg\.\d+\.\d+$/);
  });

  it("fbcFromFbclid format", () => {
    expect(fbcFromFbclid("click-id")).toMatch(/^fb\.1\.\d+\.click-id$/);
  });

  it("generateFbp format", () => {
    expect(generateFbp()).toMatch(/^fb\.1\.\d+\.\d+$/);
  });

  it("stores and forwards paid traffic attribution", () => {
    const request = new Request("https://links.test/song?utm_source=meta&utm_medium=paid_social&utm_campaign=release&utm_content=story&utm_term=spotify&ad_id=ad1&adset_id=set1&campaign_id=camp1&placement=instagram_stories&fbclid=click123", {
      headers: { referer: "https://instagram.com/" }
    });
    const generated = getMetaCookiesToSet(request);
    const attribution = trackingAttribution(request, generated);

    expect(attribution).toEqual({
      utmSource: "meta",
      utmMedium: "paid_social",
      utmCampaign: "release",
      utmContent: "story",
      utmTerm: "spotify",
      adId: "ad1",
      adsetId: "set1",
      campaignId: "camp1",
      placement: "instagram_stories",
      fbclid: "click123",
      referrer: "https://instagram.com/",
      landingPath: "/song"
    });
    expect(trackingQuerySuffix(new URL(request.url))).toContain("utm_source=meta");
    expect(trackingQuerySuffix(new URL(request.url))).toContain("fbclid=click123");
  });

  it("adds server/browser event ids to outbound tracking URLs", () => {
    const url = new URL("https://links.test/song?utm_source=meta&fbclid=click123");
    expect(trackingQuerySuffix(url, { eid: "click_lnk_test_spotify_evt123" })).toBe(
      "?utm_source=meta&fbclid=click123&eid=click_lnk_test_spotify_evt123"
    );
  });

  it("uses a valid browser click event id for CAPI dedupe", () => {
    const request = new Request("https://links.test/out/song/spotify?eid=click_lnk_test_spotify_evt123");
    expect(eventIdFromRequest(request, "fallback")).toBe("click_lnk_test_spotify_evt123");

    const invalid = new Request("https://links.test/out/song/spotify?eid=<script>");
    expect(eventIdFromRequest(invalid, "fallback")).toBe("fallback");
  });

  it("extracts coarse device hints from request headers and query params", () => {
    const request = new Request("https://links.test/out/song/spotify?sr=390x844&vp=390x720&dpr=3&tz=-180&lang=en-US", {
      headers: {
        "sec-ch-ua": "\"Chromium\";v=\"126\", \"Not A(Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": "\"iOS\"",
        "sec-ch-ua-platform-version": "\"17.5\"",
        "sec-ch-ua-model": "\"iPhone\"",
        "accept-language": "en-US,en;q=0.9"
      }
    });

    expect(deviceHintsFromRequest(request)).toEqual({
      brands: "\"Chromium\";v=\"126\", \"Not A(Brand\";v=\"99\"",
      mobile: "?1",
      platform: "\"iOS\"",
      platformVersion: "\"17.5\"",
      model: "\"iPhone\"",
      acceptLanguage: "en-US,en;q=0.9",
      screenResolution: "390x844",
      viewportSize: "390x720",
      devicePixelRatio: "3",
      timezoneOffset: "-180",
      browserLanguage: "en-US"
    });
  });

  it("reads attribution from first-party cookie on outbound clicks", () => {
    const source = new Request("https://links.test/song?utm_source=meta&utm_campaign=release&fbclid=click123");
    const generated = getMetaCookiesToSet(source);
    const attrCookie = generated.find((cookie) => cookie.name === "_dg_attr");
    const outbound = new Request("https://links.test/out/song/spotify", {
      headers: { cookie: `${attrCookie?.name}=${attrCookie?.value}` }
    });
    expect(trackingAttribution(outbound).utmCampaign).toBe("release");
    expect(trackingAttribution(outbound).fbclid).toBe("click123");
  });

  it("does not overwrite stored campaign attribution with a same-site outbound referrer", () => {
    const source = new Request("https://links.test/song?utm_source=meta&utm_campaign=release&fbclid=click123");
    const attrCookie = getMetaCookiesToSet(source).find((cookie) => cookie.name === "_dg_attr");
    const outbound = new Request("https://links.test/out/song/spotify", {
      headers: {
        cookie: `${attrCookie?.name}=${attrCookie?.value}`,
        referer: "https://links.test/song?utm_source=meta&utm_campaign=release&fbclid=click123"
      }
    });

    expect(getMetaCookiesToSet(outbound).some((cookie) => cookie.name === "_dg_attr")).toBe(false);
    expect(trackingAttribution(outbound).utmSource).toBe("meta");
  });

  it("keeps the original landing attribution when outbound links forward tracking params", () => {
    const source = new Request("https://links.test/song?utm_source=meta&utm_campaign=release&fbclid=click123", {
      headers: { referer: "https://instagram.com/" }
    });
    const attrCookie = getMetaCookiesToSet(source).find((cookie) => cookie.name === "_dg_attr");
    const outbound = new Request("https://links.test/out/song/spotify?utm_source=meta&utm_campaign=release&fbclid=click123", {
      headers: {
        cookie: `${attrCookie?.name}=${attrCookie?.value}`,
        referer: "https://links.test/song?utm_source=meta&utm_campaign=release&fbclid=click123"
      }
    });

    expect(getMetaCookiesToSet(outbound).some((cookie) => cookie.name === "_dg_attr")).toBe(false);
    expect(trackingAttribution(outbound)).toMatchObject({
      utmSource: "meta",
      utmCampaign: "release",
      fbclid: "click123",
      referrer: "https://instagram.com/",
      landingPath: "/song"
    });
  });
});

describe("client IP and geo for Meta CAPI", () => {
  it("prefers cf-connecting-ipv6 over pseudo IPv4 cf-connecting-ip", () => {
    const request = new Request("https://links.test/song", {
      headers: {
        "cf-connecting-ip": "240.16.0.1",
        "cf-connecting-ipv6": "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
      }
    });
    expect(clientIpFromRequest(request)).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
  });

  it("uses cf-connecting-ip when it is already IPv6", () => {
    const request = new Request("https://links.test/song", {
      headers: { "cf-connecting-ip": "2001:0db8::1" }
    });
    expect(clientIpFromRequest(request)).toBe("2001:0db8::1");
  });

  it("falls back to IPv4 cf-connecting-ip", () => {
    const request = new Request("https://links.test/song", {
      headers: { "cf-connecting-ip": "203.0.113.10" }
    });
    expect(clientIpFromRequest(request)).toBe("203.0.113.10");
  });

  it("returns undefined when no IP headers are present", () => {
    expect(clientIpFromRequest(new Request("https://links.test/song"))).toBeUndefined();
  });

  it("hashes normalized geo fields from request.cf", async () => {
    const request = new Request("https://links.test/song", {
      headers: { "cf-ipcountry": "US" }
    });
    Object.defineProperty(request, "cf", {
      value: {
        country: "US",
        city: "Austin",
        regionCode: "TX",
        postalCode: "78701-1234"
      }
    });

    const geo = await hashedGeoFromRequest(request);
    expect(geo.hashedCountry).toBe(await sha256Hex("us"));
    expect(geo.hashedCity).toBe(await sha256Hex("austin"));
    expect(geo.hashedState).toBe(await sha256Hex("tx"));
    expect(geo.hashedZip).toBe(await sha256Hex("78701"));
  });

  it("uses visitor location headers when request.cf geo is missing", async () => {
    const request = new Request("https://links.test/song", {
      headers: {
        "cf-ipcountry": "DE",
        "cf-ipcity": "Berlin",
        "cf-region-code": "BE",
        "cf-postal-code": "10115"
      }
    });

    const geo = await hashedGeoFromRequest(request);
    expect(geo.hashedCountry).toBe(await sha256Hex("de"));
    expect(geo.hashedCity).toBe(await sha256Hex("berlin"));
    expect(geo.hashedState).toBe(await sha256Hex("be"));
    expect(geo.hashedZip).toBe(await sha256Hex("10115"));
  });

  it("uses cf-region as a state fallback for Meta user_data", async () => {
    const request = new Request("https://links.test/song", {
      headers: {
        "cf-ipcountry": "US",
        "cf-ipcity": "Austin",
        "cf-region": "Texas"
      }
    });

    const geo = await hashedGeoFromRequest(request);
    expect(geo.hashedCity).toBe(await sha256Hex("austin"));
    expect(geo.hashedState).toBe(await sha256Hex("texas"));
  });

  it("omits invalid or unknown country codes", async () => {
    const request = new Request("https://links.test/song");
    Object.defineProperty(request, "cf", { value: { country: "XX", city: "Austin", regionCode: "TX" } });
    const geo = await hashedGeoFromRequest(request);
    expect(geo.hashedCountry).toBeUndefined();
    expect(geo.hashedCity).toBe(await sha256Hex("austin"));
    expect(geo.hashedState).toBe(await sha256Hex("tx"));
    expect(geo.hashedZip).toBeUndefined();
  });
});

describe("Meta CAPI payload", () => {
  it("enqueues Stream_Click events and writes edge analytics when a conversion queue is bound", async () => {
    const sentMessages: any[] = [];
    const analyticsPoints: any[] = [];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const env = {
      CONVERSION_EVENTS: {
        send: vi.fn(async (message: any) => {
          sentMessages.push(message);
          return { metadata: { metrics: { backlogCount: 1, backlogBytes: 1 } } };
        })
      },
      ANALYTICS: {
        writeDataPoint(point: any) {
          analyticsPoints.push(point);
        }
      }
    } as any;

    const request = new Request("https://links.test/out/song/spotify?utm_source=meta&utm_medium=paid_social&utm_campaign=release&ad_id=ad1&fbclid=click123", {
      headers: {
        "user-agent": "Mozilla/5.0",
        "cf-connecting-ip": "203.0.113.10",
        "sec-ch-ua-platform": "\"iOS\"",
        "sec-ch-ua-mobile": "?1",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    Object.defineProperty(request, "cf", {
      value: {
        country: "US",
        colo: "LAX",
        region: "California",
        regionCode: "CA",
        city: "Los Angeles",
        postalCode: "90001",
        asOrganization: "Meta Platforms, Inc.",
        asn: 32934,
        botManagement: { score: 98, verifiedBot: false, verdict: "likely_human" }
      }
    });

    await queueMetaEvent(env, request, baseLink({ track: { ...baseLink().track, isrc: "USRC17607839" } }), {
      kind: "click",
      eventName: "Stream_Click",
      eventId: "evt_stream_1",
      platform: "spotify",
      cookies: {
        fbp: "fb.1.1770000000000.1234567890",
        fbc: "fb.1.1770000000000.click123",
        externalId: "dg.1770000000000.123",
        attribution: {
          utmSource: "meta",
          utmMedium: "paid_social",
          utmCampaign: "release",
          adId: "ad1",
          fbclid: "click123",
          landingPath: "/song"
        }
      }
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(env.CONVERSION_EVENTS.send).toHaveBeenCalledOnce();
    expect(sentMessages[0]).toMatchObject({
      kind: "click",
      queuedAt: expect.any(Number),
      event: {
        eventName: "Stream_Click",
        eventId: "evt_stream_1",
        linkId: "lnk_test",
        slug: "test",
        isrc: "USRC17607839",
        platform: "spotify",
        fbp: "fb.1.1770000000000.1234567890",
        fbc: "fb.1.1770000000000.click123",
        ip: "203.0.113.10",
        userAgent: "Mozilla/5.0",
        hashedCountry: await sha256Hex("us"),
        hashedCity: await sha256Hex("losangeles"),
        hashedState: await sha256Hex("ca"),
        hashedZip: await sha256Hex("90001"),
        device: {
          platform: "\"iOS\"",
          mobile: "?1",
          acceptLanguage: "en-US,en;q=0.9"
        }
      }
    });
    expect(analyticsPoints[0]).toMatchObject({
      indexes: ["lnk_test"]
    });
    expect(analyticsPoints[0].blobs).toEqual([
      "click",
      "Stream_Click",
      "lnk_test",
      "test",
      "USRC17607839",
      "spotify",
      "meta",
      "release",
      "paid_social",
      "ad1",
      "US",
      "LAX",
      "California",
      "Los Angeles",
      "Meta Platforms, Inc.",
      "\"iOS\"",
      "?1",
      "likely_human",
      "1",
      "1"
    ]);
    expect(analyticsPoints[0].doubles).toEqual([
      expect.any(Number),
      expect.any(Number),
      1,
      1,
      1,
      1,
      98,
      32934
    ]);

    vi.unstubAllGlobals();
  });

  it("attaches a conversion value to taps but not to PageView", async () => {
    const sentMessages: any[] = [];
    const env = {
      META_CONVERSION_VALUE: "2.5",
      META_CURRENCY: "EUR",
      CONVERSION_EVENTS: { send: vi.fn(async (message: any) => { sentMessages.push(message); }) }
    } as any;

    const request = new Request("https://links.test/out/song/spotify", { headers: { "user-agent": "Mozilla/5.0" } });

    await queueMetaEvent(env, request, baseLink(), { kind: "click", eventName: "ViewContent", eventId: "evt_click", platform: "spotify" });
    await queueMetaEvent(env, request, baseLink(), { kind: "view", eventName: "PageView", eventId: "evt_view" });

    expect(sentMessages[0].event).toMatchObject({ eventName: "ViewContent", value: 2.5, currency: "EUR" });
    expect(sentMessages[1].event.value).toBeUndefined();
    expect(sentMessages[1].event.currency).toBeUndefined();
  });

  it("forwards value and currency into CAPI custom_data", async () => {
    const fetchCalls: Array<{ body: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      fetchCalls.push({ body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
    }));

    const env = {
      META_ACCESS_TOKEN: "token",
      META_PIXEL_ID: "123456",
      DB: { prepare() { return { bind() { return this; }, async first() { return null; }, async run() { return {}; }, async all() { return { results: [] }; } }; } }
    } as unknown as Parameters<typeof sendMetaBatch>[0];

    await sendMetaBatch(env, [{
      eventName: "ViewContent",
      eventId: "evt_1",
      eventTime: 1770000000,
      actionSource: "website",
      eventSourceUrl: "https://links.test/out/song/spotify",
      linkId: "lnk_1",
      slug: "song",
      trackTitle: "Song",
      artistName: "Artist",
      platform: "spotify",
      value: 2.5,
      currency: "EUR"
    }], { kind: "click" });

    expect(fetchCalls[0].body.data[0].custom_data).toMatchObject({ value: 2.5, currency: "EUR" });

    vi.unstubAllGlobals();
  });

  it("sends rich Spotify click data, referrer, hashed email, and no production test code", async () => {
    const fetchCalls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      fetchCalls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace_1" }), { status: 200 });
    }));

    const env = {
      META_ACCESS_TOKEN: "token",
      META_PIXEL_ID: "123456",
      META_TEST_EVENT_CODE: "TEST_SHOULD_NOT_LEAK",
      DB: {
        prepare(sql: string) {
          return {
            bind() { return this; },
            async first() {
              if (sql.includes("settings") && sql.includes("meta_pixel_id")) return { value: "123456" };
              if (sql.includes("settings") && sql.includes("meta_test_event_code")) return { value: "TEST_SHOULD_NOT_LEAK" };
              return null;
            },
            async run() { return { success: true }; },
            async all() { return { results: [] }; }
          };
        }
      }
    } as unknown as Parameters<typeof sendMetaBatch>[0];

    await sendMetaBatch(env, [{
      eventName: "Stream_Click",
      eventId: "evt_1",
      eventTime: 1770000000,
      actionSource: "website",
      eventSourceUrl: "https://links.test/out/song/spotify?utm_source=meta",
      referrer: "https://links.test/song",
      userAgent: "Mozilla/5.0",
      ip: "203.0.113.10",
      fbp: "fb.1.1770000000000.1234567890",
      fbc: "fb.1.1770000000000.click123",
      externalId: await sha256Hex("dg.1770000000000.123"),
      hashedEmail: await sha256Hex("fan@example.com"),
      hashedCountry: await sha256Hex("us"),
      hashedCity: await sha256Hex("austin"),
      hashedState: await sha256Hex("tx"),
      hashedZip: await sha256Hex("78701"),
      linkId: "lnk_1",
      slug: "song",
      isrc: "USRC17607839",
      trackTitle: "Song",
      artistName: "Artist",
      platform: "spotify",
      device: {
        brands: "\"Chromium\";v=\"126\"",
        mobile: "?1",
        platform: "\"iOS\"",
        platformVersion: "\"17.5\"",
        model: "\"iPhone\"",
        screenResolution: "390x844",
        viewportSize: "390x720",
        devicePixelRatio: "3",
        timezoneOffset: "-180",
        browserLanguage: "en-US",
        acceptLanguage: "en-US,en;q=0.9"
      },
      attribution: {
        utmSource: "meta",
        utmMedium: "paid_social",
        utmCampaign: "release",
        utmContent: "story",
        utmTerm: "spotify",
        adId: "ad1",
        adsetId: "set1",
        campaignId: "camp1",
        placement: "instagram_stories",
        fbclid: "click123",
        referrer: "https://instagram.com/",
        landingPath: "/song"
      }
    }], { kind: "click" });

    const body = fetchCalls[0].body;
    expect(body.test_event_code).toBeUndefined();
    expect(body.data[0].referrer_url).toBe("https://links.test/song");
    expect(body.data[0].user_data).toMatchObject({
      client_user_agent: "Mozilla/5.0",
      client_ip_address: "203.0.113.10",
      fbp: "fb.1.1770000000000.1234567890",
      fbc: "fb.1.1770000000000.click123",
      external_id: await sha256Hex("dg.1770000000000.123"),
      em: await sha256Hex("fan@example.com"),
      country: await sha256Hex("us"),
      ct: await sha256Hex("austin"),
      st: await sha256Hex("tx"),
      zp: await sha256Hex("78701")
    });
    expect(body.data[0].user_data).not.toHaveProperty("fn");
    expect(body.data[0].user_data).not.toHaveProperty("ln");
    expect(body.data[0].custom_data).toMatchObject({
      action: "musicservice",
      servicename: "spotify",
      platform: "spotify",
      link_type: "post_release",
      content_name: "Song",
      content_ids: ["USRC17607839"],
      utm_source: "meta",
      utm_medium: "paid_social",
      utm_campaign: "release",
      ad_id: "ad1"
    });
    expect(body.data[0].custom_data).toMatchObject({
      browser_brands: "\"Chromium\";v=\"126\"",
      browser_mobile: "?1",
      browser_platform: "\"iOS\"",
      browser_platform_version: "\"17.5\"",
      device_model: "\"iPhone\"",
      screen_resolution: "390x844",
      viewport_size: "390x720",
      device_pixel_ratio: "3",
      timezone_offset: "-180",
      browser_language: "en-US",
      accept_language: "en-US,en;q=0.9"
    });

    vi.unstubAllGlobals();
  });

  it("processes queued conversion messages with queue-tagged CAPI logs", async () => {
    const capiInserts: unknown[][] = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace_queue" }), { status: 200 })));

    const env = {
      META_ACCESS_TOKEN: "token",
      META_PIXEL_ID: "123456",
      DB: {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              if (sql.includes("INSERT INTO capi_log")) capiInserts.push(args);
              return this;
            },
            async first() {
              if (sql.includes("settings") && sql.includes("meta_pixel_id")) return { value: "123456" };
              return null;
            },
            async run() { return { success: true }; },
            async all() { return { results: [] }; }
          };
        }
      }
    } as any;

    const ack = vi.fn();
    const retry = vi.fn();
    const event = {
      eventName: "Stream_Click",
      eventId: "evt_queue_1",
      eventTime: 1770000000,
      actionSource: "website",
      eventSourceUrl: "https://links.test/out/song/spotify",
      linkId: "lnk_1",
      slug: "song",
      trackTitle: "Song",
      artistName: "Artist",
      platform: "spotify"
    } as const;

    await processConversionQueueBatch({
      queue: "beamlink-conversions",
      metadata: { metrics: { backlogCount: 1, backlogBytes: 1 } },
      messages: [{
        id: "msg_1",
        timestamp: new Date(),
        attempts: 1,
        body: { kind: "click", event, queuedAt: Date.now() },
        ack,
        retry
      }],
      ackAll() {},
      retryAll() {}
    } as any, env);

    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(capiInserts[0][3]).toBe("click:queue");
    expect(capiInserts[0][5]).toBe(200);
    expect(capiInserts[0][6]).toBe("trace_queue");

    vi.unstubAllGlobals();
  });

  it("retries queued conversion messages when Meta delivery fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("temporary failure", { status: 503 })));

    const env = {
      META_ACCESS_TOKEN: "token",
      META_PIXEL_ID: "123456",
      DB: {
        prepare(sql: string) {
          return {
            bind() { return this; },
            async first() {
              if (sql.includes("settings") && sql.includes("meta_pixel_id")) return { value: "123456" };
              return null;
            },
            async run() { return { success: true }; },
            async all() { return { results: [] }; }
          };
        }
      }
    } as any;

    const ack = vi.fn();
    const retry = vi.fn();

    await processConversionQueueBatch({
      queue: "beamlink-conversions",
      metadata: { metrics: { backlogCount: 1, backlogBytes: 1 } },
      messages: [{
        id: "msg_1",
        timestamp: new Date(),
        attempts: 2,
        body: {
          kind: "click",
          queuedAt: Date.now(),
          event: {
            eventName: "Stream_Click",
            eventId: "evt_queue_2",
            eventTime: 1770000000,
            actionSource: "website",
            eventSourceUrl: "https://links.test/out/song/spotify",
            linkId: "lnk_1",
            slug: "song",
            trackTitle: "Song",
            artistName: "Artist",
            platform: "spotify"
          }
        },
        ack,
        retry
      }],
      ackAll() {},
      retryAll() {}
    } as any, env);

    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: expect.any(Number) });
    expect(retry.mock.calls[0][0].delaySeconds).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  });
});

describe("Meta settings", () => {
  function settingsEnv(rows: Record<string, string | undefined>, envValues: Record<string, string | undefined> = {}) {
    return {
      ...envValues,
      DB: {
        prepare(sql: string) {
          return {
            key: "",
            bind(key: string) {
              this.key = key;
              return this;
            },
            async first() {
              if (!sql.includes("settings")) return null;
              const value = rows[this.key];
              return value === undefined ? null : { value };
            }
          };
        }
      }
    } as any;
  }

  it("uses stored Meta access token before env secret", async () => {
    const env = settingsEnv({ meta_access_token: "stored-token" }, { META_ACCESS_TOKEN: "env-token" });
    await expect(getMetaAccessToken(env)).resolves.toBe("stored-token");
  });

  it("falls back to env token when stored token is blank", async () => {
    const env = settingsEnv({ meta_access_token: "" }, { META_ACCESS_TOKEN: "env-token" });
    await expect(getMetaAccessToken(env)).resolves.toBe("env-token");
  });

  it("uses stored Meta API version before env value", async () => {
    const env = settingsEnv({ meta_api_version: "v24.0" }, { META_API_VERSION: "v23.0" });
    await expect(getMetaApiVersion(env)).resolves.toBe("v24.0");
  });

  it("normalizes Meta currency to a valid 3-letter code", () => {
    expect(getMetaCurrency(settingsEnv({}, { META_CURRENCY: "eur" }))).toBe("EUR");
    expect(getMetaCurrency(settingsEnv({}, { META_CURRENCY: "US$" }))).toBe("USD");
    expect(getMetaCurrency(settingsEnv({}, { META_CURRENCY: "" }))).toBe("USD");
  });

  it("builds a pixel-specific Test Events URL", () => {
    expect(metaEventsManagerUrl("1322204345648162")).toBe(
      "https://business.facebook.com/events_manager2/list/pixel/1322204345648162/test_events"
    );
    expect(metaEventsManagerUrl("")).toBe("https://business.facebook.com/events_manager2/list/pixel/");
  });
});

describe("bot detection", () => {
  it("flags known bot user agents", () => {
    expect(isBot(new Request("https://x", { headers: { "user-agent": "facebookexternalhit/1.1" } }))).toBe(true);
    expect(isBot(new Request("https://x", { headers: { "user-agent": "curl/8.0" } }))).toBe(true);
  });

  it("allows normal browser user agents", () => {
    expect(isBot(new Request("https://x", { headers: { "user-agent": "Mozilla/5.0 Chrome/120" } }))).toBe(false);
  });

  it("treats missing botManagement as not bot", () => {
    expect(isBot(new Request("https://x"))).toBe(false);
  });

  it("flags cloudflare bot verdicts", () => {
    const request = new Request("https://x", { headers: { "user-agent": "Mozilla/5.0" } });
    Object.defineProperty(request, "cf", { value: { botManagement: { verdict: "automated" } } });
    expect(isBot(request)).toBe(true);
  });
});

describe("effective mode and event names", () => {
  it("auto-flips presave to live after release_at", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(effectiveLinkMode(baseLink({ mode: "presave", track: { ...baseLink().track, release_at: past } }))).toBe("live");
    expect(effectiveLinkMode(baseLink({ mode: "presave", track: { ...baseLink().track, release_at: future } }))).toBe("presave");
  });

  it("resolves view event name with fallback", () => {
    expect(resolveViewEventName(baseLink({ view_event_name: "CustomView" }))).toBe("CustomView");
    expect(resolveViewEventName(baseLink({ view_event_name: "" }))).toBe("ViewContent");
  });

  it("resolves click event name by mode", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(resolveClickEventName(baseLink({ click_event_name: "CustomClick" }))).toBe("CustomClick");
    expect(resolveClickEventName(baseLink({
      mode: "presave",
      track: { ...baseLink().track, release_at: future }
    }))).toBe("Lead");
    expect(resolveClickEventName(baseLink({
      mode: "presave",
      track: { ...baseLink().track, release_at: past }
    }))).toBe("ViewContent");
    expect(resolveClickEventName(baseLink({ mode: "live" }))).toBe("ViewContent");
  });

  it("fires PageView only on the landing pixel, with its own shared event id", () => {
    const script = buildPixelScript({ pixelId: "123", pageViewEventId: "pv_1" });

    expect(script).toContain("fbq('track', 'PageView', {}, {eventID: \"pv_1\"}");
    // The landing page no longer fires ViewContent; that is reserved for the tap.
    expect(script).not.toContain("ViewContent");
  });

  it("injects the hashed external_id into fbq init for advanced matching", () => {
    const withId = buildPixelScript({ pixelId: "123", pageViewEventId: "pv_1", externalId: "a".repeat(64) });
    const withoutId = buildPixelScript({ pixelId: "123", pageViewEventId: "pv_1" });

    expect(withId).toContain("fbq('init', \"123\", {\"external_id\":\"" + "a".repeat(64) + "\"}");
    expect(withoutId).toContain("fbq('init', \"123\")");
  });
});

describe("capi_log retry query", () => {
  it("selects failed rows under attempt limit within 24h", () => {
    const { sql, bindings } = buildCapiRetryQuery();
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain("attempt < 3");
    expect(sql).toContain("kind NOT LIKE '%:queue'");
    expect(bindings).toHaveLength(1);
    const cutoff = new Date(bindings[0]).getTime();
    expect(Date.now() - cutoff).toBeLessThan(24 * 60 * 60 * 1000 + 5000);
    expect(Date.now() - cutoff).toBeGreaterThan(24 * 60 * 60 * 1000 - 5000);
  });
});

describe("access jwt", () => {
  const teamDomain = "test-team";
  const aud = "test-audience";
  const iss = `https://${teamDomain}.cloudflareaccess.com`;
  let privateKey: CryptoKey;
  let publicJwk: JsonWebKey;
  let kid: string;

  beforeEach(async () => {
    clearJwksCacheForTests();
    const pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    privateKey = pair.privateKey;
    publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    kid = "test-kid";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      keys: [{ ...publicJwk, kid, alg: "RS256", use: "sig" }]
    }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearJwksCacheForTests();
  });

  async function signJwt(payload: Record<string, unknown>): Promise<string> {
    const header = { alg: "RS256", kid };
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const body = `${encode(header)}.${encode(payload)}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(body)
    );
    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `${body}.${sig}`;
  }

  it("accepts valid token with matching aud", async () => {
    const token = await signJwt({ aud, exp: Math.floor(Date.now() / 1000) + 3600, iss });
    await expect(verifyAccessJwt(token, teamDomain, aud)).resolves.toBe(true);
  });

  it("rejects expired token", async () => {
    const token = await signJwt({ aud, exp: Math.floor(Date.now() / 1000) - 10, iss });
    await expect(verifyAccessJwt(token, teamDomain, aud)).resolves.toBe(false);
  });

  it("rejects wrong aud", async () => {
    const token = await signJwt({ aud: "other", exp: Math.floor(Date.now() / 1000) + 3600, iss });
    await expect(verifyAccessJwt(token, teamDomain, aud)).resolves.toBe(false);
  });

  it("rejects token without exp", async () => {
    const token = await signJwt({ aud, iss });
    await expect(verifyAccessJwt(token, teamDomain, aud)).resolves.toBe(false);
  });

  it("rejects token with wrong iss", async () => {
    const token = await signJwt({ aud, exp: Math.floor(Date.now() / 1000) + 3600, iss: "https://other.cloudflareaccess.com" });
    await expect(verifyAccessJwt(token, teamDomain, aud)).resolves.toBe(false);
  });

  it("rejects malformed token", async () => {
    await expect(verifyAccessJwt("not.a.jwt", teamDomain, aud)).resolves.toBe(false);
  });
});

describe("subscribe idempotency", () => {
  it("validates email format via schema", async () => {
    const { subscribeBodySchema } = await import("../src/lib/validation");
    expect(() => subscribeBodySchema.parse({ linkId: "lnk_1", email: "bad" })).toThrow();
    expect(subscribeBodySchema.parse({ linkId: "lnk_1", email: "a@b.com" })).toEqual({
      linkId: "lnk_1",
      email: "a@b.com"
    });
  });
});
