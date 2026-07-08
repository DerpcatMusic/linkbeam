import type { APIRoute } from "astro";
import { deleteLink, getLinkById, updateLink } from "@lib/db";
import { badRequest, json, notFound, readJson } from "@lib/http";
import { normalizePageStyleOptions } from "@lib/page-style-options";
import { getRuntimeEnv, requireAdmin } from "@lib/runtime";
import { linkBodySchema } from "@lib/validation";

export const GET: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;
  const link = await getLinkById(env, context.params.id ?? "");
  if (!link) return notFound();
  return json({ link });
};

export const PATCH: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;

  try {
    const body = linkBodySchema.parse(await readJson<unknown>(context.request));
    const link = await updateLink(env, context.params.id ?? "", {
      ...body,
      viewEventName: body.viewEventName,
      clickEventName: body.clickEventName,
      status: body.status,
      releaseAt: body.releaseAt,
      pageBackgroundStyle: body.pageBackgroundStyle,
      buttonStyle: body.buttonStyle,
      pageStyleOptions: body.pageStyleOptions
        ? normalizePageStyleOptions(body.pageStyleOptions)
        : undefined
    });
    return json({ link });
  } catch (error) {
    if (error instanceof Response) return error;
    return badRequest(error instanceof Error ? error.message : "Update link failed.");
  }
};

export const DELETE: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;

  try {
    await deleteLink(env, context.params.id ?? "");
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return badRequest(error instanceof Error ? error.message : "Delete link failed.");
  }
};
