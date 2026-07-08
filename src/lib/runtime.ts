import type { APIContext, AstroGlobal } from "astro";
import { env as workerEnv } from "cloudflare:workers";
import { getAccessJwt, verifyAccessJwt } from "@lib/access-jwt";
import { passwordAuthConfigured, verifyAdminSession } from "@lib/admin-session";

export type RuntimeEnv = NonNullable<App.Locals["runtime"]>["env"];

type RuntimeContext = Pick<APIContext, "locals"> | Pick<AstroGlobal, "locals">;

export function getRuntimeEnv(_context: RuntimeContext): RuntimeEnv {
  return {
    ...(import.meta.env as Record<string, unknown>),
    ...(workerEnv as Record<string, unknown>)
  } as RuntimeEnv;
}

export function getActorEmail(request: Request): string | undefined {
  return request.headers.get("cf-access-authenticated-user-email") ?? undefined;
}

function isLocalBypass(request: Request): boolean {
  if (import.meta.env.DEV) return true;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export async function requireAdmin(request: Request, env?: RuntimeEnv): Promise<Response | null> {
  if (isLocalBypass(request)) return null;

  const runtimeEnv = env ?? (workerEnv as RuntimeEnv);
  const teamDomain = runtimeEnv.CF_ACCESS_TEAM_DOMAIN;
  const aud = runtimeEnv.CF_ACCESS_AUD;

  if (teamDomain && aud) {
    const token = getAccessJwt(request);
    if (token) {
      try {
        const valid = await verifyAccessJwt(token, teamDomain, aud);
        if (valid) return null;
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }
  }

  if (passwordAuthConfigured(runtimeEnv) && await verifyAdminSession(request, runtimeEnv)) {
    return null;
  }

  if (passwordAuthConfigured(runtimeEnv) && !new URL(request.url).pathname.startsWith("/api/")) {
    const next = encodeURIComponent(new URL(request.url).pathname + new URL(request.url).search);
    return Response.redirect(new URL(`/admin/login?next=${next}`, request.url), 302);
  }

  return new Response("Not found", { status: 404 });
}

export function publicBaseUrl(env: RuntimeEnv, request: Request): string {
  const origin = new URL(request.url).origin;
  if (import.meta.env.DEV) return origin;
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return origin;
  return env.PUBLIC_BASE_URL || origin;
}

export function defer(context: RuntimeContext, promise: Promise<unknown>): void {
  const ctx = context.locals.cfContext;
  if (ctx) {
    ctx.waitUntil(promise);
    return;
  }
  promise.catch((error) => console.error(error));
}
