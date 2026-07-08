import { newId } from "@lib/id";
import { logCapiResult } from "@lib/capi-log";
import { isBot } from "@lib/bots";
import { effectiveLinkMode } from "@lib/effective-mode";
import { getMetaAccessToken, getMetaApiVersion, getMetaConversionValue, getMetaCurrency, getMetaPixelId } from "@lib/settings";
import type { RuntimeEnv } from "@lib/runtime";
import type { SmartLink } from "@lib/types";

export type EventKind = "view" | "click" | "presave" | "subscribe";

export interface QueuedMetaEvent {
  eventName: string;
  eventId: string;
  eventTime: number;
  actionSource: "website";
  eventSourceUrl: string;
  userAgent?: string;
  ip?: string;
  fbp?: string;
  fbc?: string;
  externalId?: string;
  hashedEmail?: string;
  hashedCountry?: string;
  hashedCity?: string;
  hashedState?: string;
  hashedZip?: string;
  referrer?: string;
  attribution?: TrackingAttribution;
  linkId: string;
  slug: string;
  isrc?: string;
  trackTitle: string;
  artistName: string;
  platform?: string;
  device?: DeviceHints;
  action?: string;
  linkType?: "pre_release" | "post_release";
  cta?: string;
  value?: number;
  currency?: string;
}

export interface SendMetaBatchResult {
  status: "sent" | "failed";
  httpStatus?: number;
  metaTraceId?: string;
  errorMessage?: string;
}

export interface ConversionQueueMessage {
  kind: EventKind | string;
  event: QueuedMetaEvent;
  queuedAt: number;
  testEventCode?: string;
}

export interface DeviceHints {
  brands?: string;
  mobile?: string;
  platform?: string;
  platformVersion?: string;
  model?: string;
  fullVersionList?: string;
  acceptLanguage?: string;
  screenResolution?: string;
  viewportSize?: string;
  devicePixelRatio?: string;
  timezoneOffset?: string;
  browserLanguage?: string;
}

const META_COOKIE_MAX_AGE = 7776000;
const ATTRIBUTION_COOKIE_MAX_AGE = 2592000;
const VISITOR_COOKIE_NAME = "_dg_vid";
const ATTRIBUTION_COOKIE_NAME = "_dg_attr";

const STANDARD_META_EVENTS = new Set([
  "AddPaymentInfo",
  "AddToCart",
  "AddToWishlist",
  "CompleteRegistration",
  "Contact",
  "CustomizeProduct",
  "Donate",
  "FindLocation",
  "InitiateCheckout",
  "Lead",
  "PageView",
  "Purchase",
  "Schedule",
  "Search",
  "StartTrial",
  "SubmitApplication",
  "Subscribe",
  "ViewContent"
]);

const EVENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{8,160}$/;

const TRACKING_QUERY_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "ad_id",
  "adset_id",
  "campaign_id",
  "placement",
  "fbclid"
] as const;

type TrackingQueryParam = typeof TRACKING_QUERY_PARAMS[number];

const ATTRIBUTION_KEYS: Record<TrackingQueryParam, keyof TrackingAttribution> = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm",
  ad_id: "adId",
  adset_id: "adsetId",
  campaign_id: "campaignId",
  placement: "placement",
  fbclid: "fbclid"
};

export interface TrackingAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  adId?: string;
  adsetId?: string;
  campaignId?: string;
  placement?: string;
  fbclid?: string;
  referrer?: string;
  landingPath?: string;
}

export interface TrackingCookie {
  name: string;
  value: string;
  maxAge?: number;
  httpOnly?: boolean;
}

export interface ResolvedTrackingCookies {
  fbp?: string;
  fbc?: string;
  externalId?: string;
  attribution?: TrackingAttribution;
}

export function createEventId(kind: EventKind, link: SmartLink, platform?: string): string {
  return `${kind}_${link.id}_${platform ?? "page"}_${newId("evt").slice(4)}`;
}

export function eventIdFromRequest(request: Request, fallback: string): string {
  const eventId = new URL(request.url).searchParams.get("eid")?.trim();
  return eventId && EVENT_ID_PATTERN.test(eventId) ? eventId : fallback;
}

export function metaPixelMethod(eventName: string): "track" | "trackCustom" {
  return STANDARD_META_EVENTS.has(eventName) ? "track" : "trackCustom";
}

export function trackingCookies(request: Request): { fbp?: string; fbc?: string } {
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  return {
    fbp: cookies._fbp,
    fbc: cookies._fbc ?? fbcFromFbclid(queryParamValue(request.url, "fbclid"))
  };
}

export function generateFbp(): string {
  const random = randomDecimal();
  return `fb.1.${Date.now()}.${random}`;
}

export function generateVisitorId(): string {
  return `dg.${Date.now()}.${randomDecimal()}`;
}

export function fbcFromFbclid(fbclid: string | null): string | undefined {
  if (!fbclid) return undefined;
  return `fb.1.${Date.now()}.${fbclid}`;
}

export function resolveTrackingCookies(
  request: Request,
  generated: TrackingCookie[] = []
): ResolvedTrackingCookies {
  const existing = trackingCookies(request);
  const generatedMap = Object.fromEntries(generated.map((cookie) => [cookie.name, cookie.value]));
  const requestCookies = parseCookies(request.headers.get("cookie") ?? "");
  return {
    fbp: existing.fbp ?? generatedMap._fbp,
    fbc: generatedMap._fbc ?? existing.fbc,
    externalId: requestCookies[VISITOR_COOKIE_NAME] ?? generatedMap[VISITOR_COOKIE_NAME],
    attribution: trackingAttribution(request, generated)
  };
}

export function buildMetaCookieHeaders(request: Request): string[] {
  return formatTrackingCookieHeaders(request, getMetaCookiesToSet(request));
}

export function formatTrackingCookieHeaders(request: Request, cookies: TrackingCookie[]): string[] {
  return cookies.map(
    (cookie) => `${encodeURIComponent(cookie.name)}=${encodeURIComponent(cookie.value)}; Path=/; Max-Age=${cookie.maxAge ?? META_COOKIE_MAX_AGE}; SameSite=Lax${cookie.httpOnly ? "; HttpOnly" : ""}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`
  );
}

export function getMetaCookiesToSet(request: Request): TrackingCookie[] {
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const result: TrackingCookie[] = [];
  const url = new URL(request.url);

  if (!cookies._fbp) result.push({ name: "_fbp", value: generateFbp() });
  if (!cookies[VISITOR_COOKIE_NAME]) result.push({ name: VISITOR_COOKIE_NAME, value: generateVisitorId(), httpOnly: true });

  const fbclid = queryParamValue(url, "fbclid");
  if (fbclid && (!cookies._fbc || fbclidFromFbc(cookies._fbc) !== fbclid)) {
    const fbc = fbcFromFbclid(fbclid);
    if (fbc) result.push({ name: "_fbc", value: fbc });
  }

  const attribution = attributionFromRequest(request);
  const storedAttribution = decodeAttribution(cookies[ATTRIBUTION_COOKIE_NAME]);
  const preserveStoredAttribution = hasCampaignAttribution(storedAttribution) && hasSameOriginReferrer(request);
  if (!preserveStoredAttribution && (hasCampaignAttribution(attribution) || (!cookies[ATTRIBUTION_COOKIE_NAME] && hasAttribution(attribution)))) {
    result.push({
      name: ATTRIBUTION_COOKIE_NAME,
      value: encodeAttribution(attribution),
      maxAge: ATTRIBUTION_COOKIE_MAX_AGE,
      httpOnly: true
    });
  }

  return result;
}

export interface PixelScriptOptions {
  pixelId: string | undefined;
  pageViewEventId: string;
  /** SHA-256 hex of the visitor id, mirrored server-side for dedup + advanced matching. */
  externalId?: string;
}

// The landing page fires PageView only. The meaningful conversion (ViewContent /
// Lead) is fired on the outbound streaming tap, so ViewContent means exactly one
// thing: "the visitor chose a platform to listen." See resolveClickEventName.
export function buildPixelScript(options: PixelScriptOptions): string {
  const { pixelId, pageViewEventId, externalId } = options;
  if (!pixelId) return "";
  // A 64-char hex string is recognised by fbevents.js as already hashed, so it is
  // passed through untouched and matches the SHA-256 external_id we send via CAPI.
  const initArgs = externalId
    ? `${JSON.stringify(pixelId)}, ${JSON.stringify({ external_id: externalId })}`
    : JSON.stringify(pixelId);
  return `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${initArgs});
fbq('track', 'PageView', {}, {eventID: ${JSON.stringify(pageViewEventId)}});
`;
}

export function clientIpFromRequest(request: Request): string | undefined {
  const ipv6Header = request.headers.get("cf-connecting-ipv6")?.trim();
  if (ipv6Header) return ipv6Header;

  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
  return connectingIp || undefined;
}

interface CfGeoFields {
  country?: string | null;
  city?: string | null;
  region?: string | null;
  regionCode?: string | null;
  postalCode?: string | null;
}

function cfGeoFromRequest(request: Request): CfGeoFields {
  const cf = (request as Request & { cf?: CfGeoFields }).cf;
  const country = boundedGeo(cf?.country ?? request.headers.get("cf-ipcountry"));
  const city = boundedGeo(cf?.city ?? request.headers.get("cf-ipcity"));
  const regionCode = boundedGeo(cf?.regionCode ?? request.headers.get("cf-region-code") ?? cf?.region ?? request.headers.get("cf-region"));
  const postalCode = boundedGeo(cf?.postalCode ?? request.headers.get("cf-postal-code"));
  return {
    country: country || undefined,
    city: city || undefined,
    regionCode: regionCode || undefined,
    postalCode: postalCode || undefined
  };
}

function boundedGeo(value: string | null | undefined): string {
  return value?.trim().slice(0, 80) ?? "";
}

function normalizeCountryCode(value: string): string | undefined {
  const code = value.trim().toLowerCase();
  if (!code || code === "xx" || code === "t1") return undefined;
  return /^[a-z]{2}$/.test(code) ? code : undefined;
}

function normalizeCity(value: string): string | undefined {
  const normalized = value.trim().toLowerCase().replace(/[^a-z\u00C0-\u024F\u1E00-\u1EFF]/g, "");
  return normalized || undefined;
}

function normalizeState(value: string): string | undefined {
  const normalized = value.trim().toLowerCase().replace(/[^a-z]/g, "");
  return normalized || undefined;
}

function normalizeZip(value: string, country?: string): string | undefined {
  let normalized = value.trim().toLowerCase().replace(/[\s-]/g, "");
  if (!normalized) return undefined;
  if (country === "us" && /^\d{5}/.test(normalized)) normalized = normalized.slice(0, 5);
  return normalized;
}

export async function hashedGeoFromRequest(request: Request): Promise<{
  hashedCountry?: string;
  hashedCity?: string;
  hashedState?: string;
  hashedZip?: string;
}> {
  const geo = cfGeoFromRequest(request);
  const country = geo.country ? normalizeCountryCode(geo.country) : undefined;
  const city = geo.city ? normalizeCity(geo.city) : undefined;
  const state = geo.regionCode ? normalizeState(geo.regionCode) : undefined;
  const zip = geo.postalCode ? normalizeZip(geo.postalCode, country) : undefined;

  const [hashedCountry, hashedCity, hashedState, hashedZip] = await Promise.all([
    country ? sha256Hex(country) : undefined,
    city ? sha256Hex(city) : undefined,
    state ? sha256Hex(state) : undefined,
    zip ? sha256Hex(zip) : undefined
  ]);

  return { hashedCountry, hashedCity, hashedState, hashedZip };
}

export async function queueMetaEvent(env: RuntimeEnv, request: Request, link: SmartLink, options: {
  kind: EventKind;
  eventName: string;
  eventId: string;
  platform?: string;
  testEventCode?: string;
  cookies?: ResolvedTrackingCookies;
  email?: string;
}): Promise<void> {
  if (isBot(request)) return;

  const url = new URL(request.url);
  const cookies = options.cookies ?? resolveTrackingCookies(request);
  const linkType = effectiveLinkMode(link) === "presave" ? "pre_release" : "post_release";
  // Attach a value only to conversion events (the tap / pre-save / email signup),
  // never to PageView — this is what unlocks value-based optimization.
  const conversionValue = options.kind === "view" ? undefined : getMetaConversionValue(env);
  const geo = await hashedGeoFromRequest(request);
  const payload: QueuedMetaEvent = {
    eventName: options.eventName,
    eventId: options.eventId,
    eventTime: Math.floor(Date.now() / 1000),
    actionSource: "website",
    eventSourceUrl: url.toString(),
    userAgent: request.headers.get("user-agent") ?? undefined,
    ip: clientIpFromRequest(request),
    referrer: request.headers.get("referer") ?? undefined,
    fbp: cookies.fbp,
    fbc: cookies.fbc,
    externalId: cookies.externalId ? await sha256Hex(cookies.externalId) : undefined,
    hashedEmail: options.email ? await sha256Hex(options.email.trim().toLowerCase()) : undefined,
    hashedCountry: geo.hashedCountry,
    hashedCity: geo.hashedCity,
    hashedState: geo.hashedState,
    hashedZip: geo.hashedZip,
    attribution: cookies.attribution,
    linkId: link.id,
    slug: link.slug,
    isrc: link.track.isrc ?? undefined,
    trackTitle: link.track.title,
    artistName: link.track.artist_name,
    platform: options.platform,
    device: deviceHintsFromRequest(request),
    action: actionForKind(options.kind),
    linkType,
    cta: ctaForPlatform(options.platform, linkType),
    value: conversionValue,
    currency: conversionValue === undefined ? undefined : getMetaCurrency(env)
  };

  writeConversionAnalytics(env, request, payload, options.kind);

  const conversionQueue = (env as RuntimeEnv & { CONVERSION_EVENTS?: Queue<ConversionQueueMessage> }).CONVERSION_EVENTS;
  if (conversionQueue) {
    await conversionQueue.send({
      kind: options.kind,
      event: payload,
      queuedAt: Date.now(),
      testEventCode: options.testEventCode
    });
    return;
  }

  await sendMetaBatch(env, [payload], { kind: options.kind, testEventCode: options.testEventCode });
}

export async function processConversionQueueBatch(
  batch: MessageBatch<ConversionQueueMessage>,
  env: RuntimeEnv
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const result = await sendMetaBatch(env, [message.body.event], {
        kind: `${message.body.kind}:queue`,
        attempt: message.attempts,
        testEventCode: message.body.testEventCode
      });

      if (result.status === "sent" || result.errorMessage === "Meta CAPI not configured") {
        message.ack();
        continue;
      }

      message.retry({ delaySeconds: conversionRetryDelaySeconds(message.attempts) });
    } catch {
      message.retry({ delaySeconds: conversionRetryDelaySeconds(message.attempts) });
    }
  }
}

function writeConversionAnalytics(env: RuntimeEnv, request: Request, event: QueuedMetaEvent, kind: EventKind): void {
  if (!env.ANALYTICS) return;

  const cf = (request as Request & {
    cf?: {
      country?: string;
      colo?: string;
      region?: string;
      city?: string;
      asOrganization?: string;
      asn?: number;
      botManagement?: {
        score?: number;
        verifiedBot?: boolean;
        verdict?: string;
      };
    };
  }).cf;

  env.ANALYTICS.writeDataPoint({
    blobs: [
      kind,
      event.eventName,
      event.linkId,
      event.slug,
      event.isrc ?? "",
      event.platform ?? "",
      event.attribution?.utmSource ?? "",
      event.attribution?.utmCampaign ?? "",
      event.attribution?.utmMedium ?? "",
      event.attribution?.adId ?? "",
      cf?.country ?? "",
      cf?.colo ?? "",
      cf?.region ?? "",
      cf?.city ?? "",
      cf?.asOrganization ?? "",
      request.headers.get("sec-ch-ua-platform") ?? "",
      request.headers.get("sec-ch-ua-mobile") ?? "",
      cf?.botManagement?.verdict ?? "",
      event.fbc ? "1" : "0",
      event.fbp ? "1" : "0"
    ].map(analyticsBlob),
    doubles: [
      Date.now(),
      event.eventTime,
      event.ip ? 1 : 0,
      event.userAgent ? 1 : 0,
      event.attribution?.fbclid ? 1 : 0,
      event.externalId ? 1 : 0,
      cf?.botManagement?.score ?? -1,
      cf?.asn ?? 0
    ],
    indexes: [event.linkId]
  });
}

function analyticsBlob(value: string): string {
  return value.slice(0, 256);
}

function conversionRetryDelaySeconds(attempts: number): number {
  return Math.min(Math.max(attempts, 1) * 30, 300);
}

export async function sendMetaBatch(
  env: RuntimeEnv,
  events: QueuedMetaEvent[],
  options: { kind?: string; attempt?: number; testEventCode?: string; skipRetryLog?: boolean } = {}
): Promise<SendMetaBatchResult> {
  const [pixelId, accessToken, apiVersion] = await Promise.all([
    getMetaPixelId(env),
    getMetaAccessToken(env),
    getMetaApiVersion(env)
  ]);
  if (!accessToken || !pixelId || events.length === 0) {
    return { status: "failed", errorMessage: "Meta CAPI not configured" };
  }

  const url = `https://graph.facebook.com/${apiVersion}/${pixelId}/events`;
  const testEventCode = options.testEventCode;
  const body: Record<string, unknown> = {
    data: events.map((event) => ({
      event_name: event.eventName,
      event_time: event.eventTime,
      event_id: event.eventId,
      action_source: event.actionSource,
      event_source_url: event.eventSourceUrl,
      referrer_url: event.referrer,
      user_data: buildMetaUserData(event),
      custom_data: {
        action: event.action ?? defaultAction(event),
        value: event.value,
        currency: event.currency,
        servicename: event.platform,
        content_name: event.trackTitle,
        content_category: "music",
        content_ids: event.isrc ? [event.isrc] : [event.slug],
        content_type: "music",
        artist: event.artistName,
        artists: event.artistName.split(",").map((artist) => artist.trim()).filter(Boolean),
        song_name: event.trackTitle,
        slug: event.slug,
        platform: event.platform,
        link_type: event.linkType ?? "post_release",
        cta: event.cta,
        utm_source: event.attribution?.utmSource,
        utm_medium: event.attribution?.utmMedium,
        utm_campaign: event.attribution?.utmCampaign,
        utm_content: event.attribution?.utmContent,
        utm_term: event.attribution?.utmTerm,
        ad_id: event.attribution?.adId,
        adset_id: event.attribution?.adsetId,
        campaign_id: event.attribution?.campaignId,
        placement: event.attribution?.placement,
        landing_path: event.attribution?.landingPath,
        source_referrer: event.attribution?.referrer,
        browser_brands: event.device?.brands,
        browser_mobile: event.device?.mobile,
        browser_platform: event.device?.platform,
        browser_platform_version: event.device?.platformVersion,
        browser_full_version_list: event.device?.fullVersionList,
        device_model: event.device?.model,
        screen_resolution: event.device?.screenResolution,
        viewport_size: event.device?.viewportSize,
        device_pixel_ratio: event.device?.devicePixelRatio,
        timezone_offset: event.device?.timezoneOffset,
        browser_language: event.device?.browserLanguage,
        accept_language: event.device?.acceptLanguage
      }
    })),
    access_token: accessToken
  };
  if (testEventCode) body.test_event_code = testEventCode;

  const kind = options.kind ?? "unknown";
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    const result: SendMetaBatchResult = {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Meta CAPI request failed"
    };
    if (!options.skipRetryLog) {
      await logCapiResult(env, { event: events[0], kind, attempt: options.attempt }, result);
    }
    return result;
  }

  const text = await response.text();
  let metaTraceId: string | undefined;
  try {
    const parsed = JSON.parse(text) as { fbtrace_id?: string };
    metaTraceId = parsed.fbtrace_id;
  } catch {
    // ignore parse errors
  }

  if (!response.ok) {
    const result: SendMetaBatchResult = {
      status: "failed",
      httpStatus: response.status,
      metaTraceId,
      errorMessage: `Meta CAPI failed: ${response.status} ${text}`
    };
    if (!options.skipRetryLog) {
      await logCapiResult(env, { event: events[0], kind, attempt: options.attempt }, result);
    }
    return result;
  }

  const result: SendMetaBatchResult = {
    status: "sent",
    httpStatus: response.status,
    metaTraceId
  };
  if (!options.skipRetryLog) {
    await logCapiResult(env, { event: events[0], kind, attempt: options.attempt }, result);
  }
  return result;
}

function buildMetaUserData(event: QueuedMetaEvent): Record<string, string> {
  const data: Record<string, string | undefined> = {
    client_user_agent: event.userAgent,
    client_ip_address: event.ip,
    fbp: event.fbp,
    fbc: event.fbc,
    external_id: event.externalId,
    em: event.hashedEmail,
    country: event.hashedCountry,
    ct: event.hashedCity,
    st: event.hashedState,
    zp: event.hashedZip
  };
  return Object.fromEntries(
    Object.entries(data).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function trackingAttribution(request: Request, generated: TrackingCookie[] = []): TrackingAttribution {
  const generatedMap = Object.fromEntries(generated.map((cookie) => [cookie.name, cookie.value]));
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const stored = decodeAttribution(generatedMap[ATTRIBUTION_COOKIE_NAME] ?? cookies[ATTRIBUTION_COOKIE_NAME]);
  if (hasCampaignAttribution(stored) && hasSameOriginReferrer(request)) return stored;
  return { ...stored, ...attributionFromRequest(request) };
}

export function trackingQuerySuffix(url: URL, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const key of TRACKING_QUERY_PARAMS) {
    const value = url.searchParams.get(key);
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function hasPaidAttribution(attribution: TrackingAttribution | undefined): boolean {
  if (!attribution) return false;
  const paidMedium = attribution.utmMedium?.toLowerCase() ?? "";
  const paidSource = attribution.utmSource?.toLowerCase() ?? "";
  return Boolean(
    attribution.fbclid ||
    attribution.adId ||
    attribution.adsetId ||
    attribution.campaignId ||
    paidSource === "meta" ||
    paidSource === "facebook" ||
    paidSource === "instagram" ||
    paidMedium.includes("paid") ||
    paidMedium.includes("cpc") ||
    paidMedium.includes("ppc")
  );
}

export function paidEventId(eventId: string): string {
  const suffix = "_paid";
  return eventId.endsWith(suffix) ? eventId : `${eventId}${suffix}`;
}

export function deviceHintsFromRequest(request: Request): DeviceHints | undefined {
  const url = new URL(request.url);
  const hints: DeviceHints = {
    brands: boundedHint(request.headers.get("sec-ch-ua"), 256),
    mobile: boundedHint(request.headers.get("sec-ch-ua-mobile"), 16),
    platform: boundedHint(request.headers.get("sec-ch-ua-platform"), 80),
    platformVersion: boundedHint(request.headers.get("sec-ch-ua-platform-version"), 80),
    model: boundedHint(request.headers.get("sec-ch-ua-model"), 120),
    fullVersionList: boundedHint(request.headers.get("sec-ch-ua-full-version-list"), 256),
    acceptLanguage: boundedHint(request.headers.get("accept-language"), 120),
    screenResolution: boundedHint(url.searchParams.get("sr"), 32),
    viewportSize: boundedHint(url.searchParams.get("vp"), 32),
    devicePixelRatio: boundedHint(url.searchParams.get("dpr"), 16),
    timezoneOffset: boundedHint(url.searchParams.get("tz"), 16),
    browserLanguage: boundedHint(url.searchParams.get("lang"), 80)
  };

  for (const key of Object.keys(hints) as Array<keyof DeviceHints>) {
    if (!hints[key]) delete hints[key];
  }

  return Object.keys(hints).length > 0 ? hints : undefined;
}

function boundedHint(value: string | null, maxLength: number): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function parseCookies(header: string): Record<string, string> {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...value] = part.split("=");
        return [decodeCookiePart(key), decodeCookiePart(value.join("="))];
      })
  );
}

function decodeCookiePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function queryParamValue(url: string | URL, key: string): string | null {
  const rawQuery = typeof url === "string" ? new URL(url).search : url.search;
  const query = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;
  for (const part of query.split("&")) {
    if (!part) continue;
    const [rawKey, ...rawValueParts] = part.split("=");
    if (decodeQueryPart(rawKey) === key) {
      return decodeQueryPart(rawValueParts.join("="));
    }
  }
  return null;
}

function decodeQueryPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function randomDecimal(): string {
  return crypto.getRandomValues(new Uint32Array(1))[0].toString();
}

function fbclidFromFbc(fbc: string): string {
  return fbc.slice(fbc.lastIndexOf(".") + 1);
}

function attributionFromRequest(request: Request): TrackingAttribution {
  const url = new URL(request.url);
  const attribution: TrackingAttribution = {};
  for (const key of TRACKING_QUERY_PARAMS) {
    const value = key === "fbclid" ? queryParamValue(url, key) : url.searchParams.get(key);
    if (value) {
      attribution[ATTRIBUTION_KEYS[key]] = value;
    }
  }
  const referrer = request.headers.get("referer");
  if (referrer) attribution.referrer = referrer;
  if (hasAttribution(attribution)) attribution.landingPath = url.pathname;
  return attribution;
}

function hasAttribution(attribution: TrackingAttribution): boolean {
  return Object.values(attribution).some(Boolean);
}

function hasCampaignAttribution(attribution: TrackingAttribution): boolean {
  return Boolean(
    attribution.utmSource ||
    attribution.utmMedium ||
    attribution.utmCampaign ||
    attribution.utmContent ||
    attribution.utmTerm ||
    attribution.adId ||
    attribution.adsetId ||
    attribution.campaignId ||
    attribution.placement ||
    attribution.fbclid
  );
}

function hasSameOriginReferrer(request: Request): boolean {
  const referrer = request.headers.get("referer");
  if (!referrer) return false;
  try {
    return new URL(referrer).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function encodeAttribution(attribution: TrackingAttribution): string {
  const json = JSON.stringify(attribution);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeAttribution(value: string | undefined): TrackingAttribution {
  if (!value) return {};
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as TrackingAttribution;
  } catch {
    return {};
  }
}

function actionForKind(kind: EventKind): string {
  if (kind === "view") return "pageview";
  if (kind === "click") return "musicservice";
  if (kind === "presave") return "pre_save";
  return "complete_registration";
}

function defaultAction(event: QueuedMetaEvent): string {
  return event.platform ? "musicservice" : "pageview";
}

function ctaForPlatform(platform: string | undefined, linkType: "pre_release" | "post_release"): string | undefined {
  if (!platform) return undefined;
  if (linkType === "pre_release") {
    if (platform === "spotify") return "Pre-save on Spotify";
    if (platform === "apple") return "Pre-save on Apple Music";
    return "Pre-save";
  }
  if (platform === "spotify") return "Play on Spotify";
  if (platform === "apple") return "Play on Apple Music";
  return "Listen";
}
