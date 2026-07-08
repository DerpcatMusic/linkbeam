import type { APIRoute } from "astro";
import { getPublishedLink, incrementDailyMetric, subscribeEmail } from "@lib/db";
import { badRequest, json, notFound, readJson } from "@lib/http";
import { defer, getRuntimeEnv } from "@lib/runtime";
import { isBot } from "@lib/bots";
import { createEventId, queueMetaEvent, resolveTrackingCookies } from "@lib/tracking";
import { recordMetricEvent } from "@lib/metrics";
import { subscribeBodySchema } from "@lib/validation";

export const POST: APIRoute = async (context) => {
  try {
    const env = getRuntimeEnv(context);
    const body = subscribeBodySchema.parse(await readJson<unknown>(context.request));

    const row = await env.DB.prepare("SELECT slug FROM links WHERE id = ? AND status = 'published'")
      .bind(body.linkId)
      .first<{ slug: string }>();
    if (!row) return notFound();

    const link = await getPublishedLink(env, row.slug);
    if (!link) return notFound();

    const result = await subscribeEmail(env, body.linkId, body.email);
    if (result.created && !isBot(context.request)) {
      const eventId = createEventId("subscribe", link);
      const trackingCookies = resolveTrackingCookies(context.request);
      defer(context, queueMetaEvent(env, context.request, link, {
        kind: "subscribe",
        eventName: "CompleteRegistration",
        eventId,
        cookies: trackingCookies,
        email: body.email
      }));
      defer(context, incrementDailyMetric(env, link.id, "presaves"));
      defer(context, recordMetricEvent(env, { linkId: link.id, kind: "subscribe", request: context.request, cookies: trackingCookies }));
    }

    return json({ ok: true, created: result.created });
  } catch (error) {
    if (error instanceof Response) return error;
    return badRequest(error instanceof Error ? error.message : "Subscribe failed.");
  }
};
