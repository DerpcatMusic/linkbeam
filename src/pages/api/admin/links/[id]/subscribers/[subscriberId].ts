import type { APIRoute } from "astro";
import { deleteSubscriber, getLinkById } from "@lib/db";
import { json, notFound } from "@lib/http";
import { getRuntimeEnv, requireAdmin } from "@lib/runtime";

export const DELETE: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;
  const linkId = context.params.id ?? "";
  const subscriberId = context.params.subscriberId ?? "";
  if (!await getLinkById(env, linkId)) return notFound();
  return await deleteSubscriber(env, linkId, subscriberId) ? json({ ok: true }) : notFound();
};
