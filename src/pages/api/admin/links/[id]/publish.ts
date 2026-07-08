import type { APIRoute } from "astro";
import { publishLink } from "@lib/db";
import { badRequest, json } from "@lib/http";
import { getRuntimeEnv, requireAdmin } from "@lib/runtime";

export const POST: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;

  try {
    const link = await publishLink(env, context.params.id ?? "");
    return json({ link });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Publish failed.");
  }
};
