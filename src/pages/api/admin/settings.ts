import type { APIRoute } from "astro";
import { listRecentCapiLogs } from "@lib/capi-log";
import { getMetaAccessToken, getMetaApiVersion, getMetaPixelId, getMetaTestEventCode, getMetaAdAccountId, setSetting } from "@lib/settings";
import { badRequest, json, readJson } from "@lib/http";
import { getRuntimeEnv, requireAdmin } from "@lib/runtime";
import { settingsBodySchema } from "@lib/validation";

export const GET: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;

  const [metaPixelId, metaTestEventCode, metaAccessToken, metaApiVersion, metaAdAccountId, capiLogs] = await Promise.all([
    getMetaPixelId(env),
    getMetaTestEventCode(env),
    getMetaAccessToken(env),
    getMetaApiVersion(env),
    getMetaAdAccountId(env),
    listRecentCapiLogs(env, 50)
  ]);

  return json({
    metaPixelId: metaPixelId ?? "",
    metaApiVersion,
    metaTestEventCode: metaTestEventCode ?? "",
    metaAdAccountId: metaAdAccountId ?? "",
    hasMetaAccessToken: Boolean(metaAccessToken),
    capiLogs
  });
};

export const PATCH: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;

  try {
    const body = settingsBodySchema.parse(await readJson<unknown>(context.request));
    if (body.metaPixelId !== undefined) await setSetting(env, "meta_pixel_id", body.metaPixelId.trim());
    if (body.metaAccessToken !== undefined && body.metaAccessToken.trim()) await setSetting(env, "meta_access_token", body.metaAccessToken.trim());
    if (body.metaApiVersion !== undefined) await setSetting(env, "meta_api_version", body.metaApiVersion.trim());
    if (body.metaTestEventCode !== undefined) await setSetting(env, "meta_test_event_code", body.metaTestEventCode.trim());
    if (body.metaAdAccountId !== undefined) await setSetting(env, "meta_ad_account_id", body.metaAdAccountId.trim());
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return badRequest(error instanceof Error ? error.message : "Settings update failed.");
  }
};
