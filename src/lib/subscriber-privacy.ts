import type { RuntimeEnv } from "@lib/runtime";
import { clientIpFromRequest } from "@lib/tracking";

const WINDOW_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const DEFAULT_RETENTION_DAYS = 365;

type PrivacyEnv = RuntimeEnv & {
  RATE_LIMIT_SECRET?: string;
  SUBSCRIBER_RETENTION_DAYS?: string;
};

export async function consumeSubscribeLimit(env: PrivacyEnv, request: Request, linkId: string): Promise<boolean> {
  const secret = env.RATE_LIMIT_SECRET?.trim();
  if (!secret) throw new Error("RATE_LIMIT_SECRET is not configured.");
  const client = clientIpFromRequest(request) ?? "unknown";
  const digest = await hmacHex(secret, `${linkId}:${client}`);
  const key = `subscribe-rate:${digest}`;
  const count = Number(await env.LINK_CACHE.get(key) ?? "0");
  if (count >= MAX_ATTEMPTS) return false;
  await env.LINK_CACHE.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  return true;
}

export function retentionDaysFromEnv(env: Pick<PrivacyEnv, "SUBSCRIBER_RETENTION_DAYS">): number {
  const days = Number(env.SUBSCRIBER_RETENTION_DAYS);
  return Number.isInteger(days) && days > 0 && days <= 3650 ? days : DEFAULT_RETENTION_DAYS;
}

export async function deleteExpiredSubscribers(env: PrivacyEnv): Promise<number> {
  const days = retentionDaysFromEnv(env);
  const result = await env.DB.prepare(
    "DELETE FROM subscribers WHERE consented_at < datetime('now', ?)"
  ).bind(`-${days} days`).run();
  return result.meta?.changes ?? 0;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
