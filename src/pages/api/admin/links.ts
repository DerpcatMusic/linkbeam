import type { APIRoute } from "astro";
import { createLink, listLinks } from "@lib/db";
import { badRequest, json, readJson } from "@lib/http";
import { getRuntimeEnv, requireAdmin } from "@lib/runtime";
import { linkBodySchema } from "@lib/validation";

export const GET: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;
  return json({ links: await listLinks(env) });
};

export const POST: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;

  try {
    const body = linkBodySchema.parse(await readJson<unknown>(context.request));
    const link = await createLink(env, body);
    return json({ link }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return badRequest(error instanceof Error ? error.message : "Create link failed.");
  }
};
