import type { APIRoute } from "astro";
import { ensureDemoSmartLink } from "@lib/demo-link";
import { getRuntimeEnv } from "@lib/runtime";

export const GET: APIRoute = async (context) => {
  const link = await ensureDemoSmartLink(getRuntimeEnv(context));
  return context.redirect(`/${link.slug}`, 302);
};
