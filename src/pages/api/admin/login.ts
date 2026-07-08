import type { APIRoute } from "astro";
import { createAdminSessionCookie, passwordAuthConfigured, verifyAdminPassword } from "@lib/admin-session";
import { getRuntimeEnv } from "@lib/runtime";

export const POST: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  if (!passwordAuthConfigured(env)) {
    return new Response("Not found", { status: 404 });
  }

  const form = await context.request.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/admin"));

  if (!await verifyAdminPassword(password, env)) {
    return Response.redirect(new URL(`/admin/login?error=1&next=${encodeURIComponent(next)}`, context.request.url), 303);
  }

  return new Response(null, {
    status: 303,
    headers: {
      "Location": next,
      "Set-Cookie": await createAdminSessionCookie(env)
    }
  });
};

function safeNext(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/admin";
  if (value.startsWith("/api/")) return "/admin";
  return value;
}
