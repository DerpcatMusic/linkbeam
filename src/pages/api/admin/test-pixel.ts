import type { APIRoute } from "astro";
import { newId } from "@lib/id";
import { getMetaTestEventCode } from "@lib/settings";
import { badRequest, json } from "@lib/http";
import { getRuntimeEnv, requireAdmin } from "@lib/runtime";
import { clientIpFromRequest, hashedGeoFromRequest, sendMetaBatch } from "@lib/tracking";

export const POST: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;

  try {
    const testEventCode = await getMetaTestEventCode(env);
    const eventId = `test_${newId("evt").slice(4)}`;
    const geo = await hashedGeoFromRequest(context.request);
    const event = {
      eventName: "ViewContent",
      eventId,
      eventTime: Math.floor(Date.now() / 1000),
      actionSource: "website" as const,
      eventSourceUrl: new URL(context.request.url).origin + "/admin/settings",
      userAgent: context.request.headers.get("user-agent") ?? undefined,
      ip: clientIpFromRequest(context.request),
      hashedCountry: geo.hashedCountry,
      hashedCity: geo.hashedCity,
      hashedState: geo.hashedState,
      hashedZip: geo.hashedZip,
      linkId: "test",
      slug: "pixel-test",
      trackTitle: "Pixel Test",
      artistName: "Admin"
    };

    const result = await sendMetaBatch(env, [event], { kind: "test", testEventCode });
    return json({
      eventId,
      testEventCode: testEventCode ?? null,
      ...result
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Pixel test failed.");
  }
};
