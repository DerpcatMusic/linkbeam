import type { APIRoute } from "astro";
import { getPublishedLink, incrementDailyMetric } from "@lib/db";
import { notFound } from "@lib/http";
import { defer, getRuntimeEnv } from "@lib/runtime";
import { isBot } from "@lib/bots";
import { resolveClickEventName, resolvePaidClickEventName } from "@lib/effective-mode";
import { createEventId, eventIdFromRequest, formatTrackingCookieHeaders, getMetaCookiesToSet, hasPaidAttribution, paidEventId, queueMetaEvent, resolveTrackingCookies } from "@lib/tracking";
import { recordMetricEvent } from "@lib/metrics";
import { spotifyDestinationUrl } from "@lib/spotify-links";

export const GET: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const slug = context.params.slug ?? "";
  const platform = context.params.platform ?? "";
  const link = await getPublishedLink(env, slug);
  if (!link) return notFound();
  const destination = link.destinations.find((item) => item.platform === platform);
  if (!destination) return notFound();
  const targetUrl = spotifyDestinationUrl(link, destination);
  const trackOnly = new URL(context.request.url).searchParams.get("track_only") === "1";

  if (!isBot(context.request)) {
    const cookiesToSet = getMetaCookiesToSet(context.request);
    const trackingCookies = resolveTrackingCookies(context.request, cookiesToSet);
    const isPresave = link.mode === "presave";
    const fallbackEventId = createEventId(isPresave ? "presave" : "click", link, platform);
    const eventId = eventIdFromRequest(context.request, fallbackEventId);
    const attribution = trackingCookies.attribution;
    defer(context, queueMetaEvent(env, context.request, link, {
      kind: isPresave ? "presave" : "click",
      eventName: resolveClickEventName(link),
      eventId,
      platform,
      cookies: trackingCookies
    }));
    if (!isPresave && hasPaidAttribution(attribution)) {
      defer(context, queueMetaEvent(env, context.request, link, {
        kind: "click",
        eventName: resolvePaidClickEventName(link),
        eventId: paidEventId(eventId),
        platform,
        cookies: trackingCookies
      }));
    }
    defer(context, incrementDailyMetric(env, link.id, isPresave ? "presaves" : "clicks", platform));
    defer(context, recordMetricEvent(env, {
      linkId: link.id,
      kind: isPresave ? "presave" : "click",
      platform,
      request: context.request,
      cookies: trackingCookies
    }));

    const response = trackOnly ? new Response(null, { status: 204 }) : context.redirect(targetUrl, 302);
    for (const cookie of formatTrackingCookieHeaders(context.request, cookiesToSet)) {
      response.headers.append("Set-Cookie", cookie);
    }
    return response;
  }

  if (trackOnly) return new Response(null, { status: 204 });
  return context.redirect(targetUrl, 302);
};
