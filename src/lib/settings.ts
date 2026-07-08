import type { RuntimeEnv } from "@lib/runtime";

export type SettingKey =
  | "meta_pixel_id"
  | "meta_access_token"
  | "meta_api_version"
  | "meta_test_event_code"
  | "meta_ad_account_id"
  | "onboarding_completed"
  | "onboarding_step"
  | "onboarding_skipped_steps";

export async function getSetting(env: RuntimeEnv, key: SettingKey): Promise<string | undefined> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value;
}

export async function setSetting(env: RuntimeEnv, key: SettingKey, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind(key, value)
    .run();
}

export async function getMetaPixelId(env: RuntimeEnv): Promise<string | undefined> {
  return (await getSetting(env, "meta_pixel_id")) || env.META_PIXEL_ID;
}

export async function getMetaTestEventCode(env: RuntimeEnv): Promise<string | undefined> {
  const dbValue = await getSetting(env, "meta_test_event_code");
  if (dbValue !== undefined && dbValue !== "") return dbValue;
  return env.META_TEST_EVENT_CODE || undefined;
}

export async function getMetaAccessToken(env: RuntimeEnv): Promise<string | undefined> {
  const dbValue = await getSetting(env, "meta_access_token");
  if (dbValue !== undefined && dbValue !== "") return dbValue;
  return env.META_ACCESS_TOKEN || undefined;
}

export async function getMetaApiVersion(env: RuntimeEnv): Promise<string> {
  const dbValue = await getSetting(env, "meta_api_version");
  if (dbValue !== undefined && dbValue !== "") return dbValue;
  return env.META_API_VERSION || "v23.0";
}

// Relative optimization value per conversion (not literal revenue). Defaults to 1
// so value-based optimization works out of the box even when META_CONVERSION_VALUE
// isn't pushed (e.g. deploys using --keep-vars); override via the env var to tune.
export function getMetaConversionValue(env: RuntimeEnv): number {
  const raw = env.META_CONVERSION_VALUE;
  const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 1;
}

export function getMetaCurrency(env: RuntimeEnv): string {
  const currency = env.META_CURRENCY?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

export function normalizeAdAccountId(raw: string | undefined | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/^act_/i, "");
  if (!/^\d+$/.test(digits)) return undefined;
  return `act_${digits}`;
}

export async function getMetaAdAccountId(env: RuntimeEnv): Promise<string | undefined> {
  const stored = normalizeAdAccountId(await getSetting(env, "meta_ad_account_id"));
  if (stored) return stored;
  return normalizeAdAccountId(env.META_AD_ACCOUNT_ID);
}

export async function isOnboardingCompleted(env: RuntimeEnv): Promise<boolean> {
  return (await getSetting(env, "onboarding_completed")) === "1";
}

export async function setOnboardingCompleted(env: RuntimeEnv, completed = true): Promise<void> {
  await setSetting(env, "onboarding_completed", completed ? "1" : "0");
}

export async function getOnboardingStep(env: RuntimeEnv): Promise<string | undefined> {
  return getSetting(env, "onboarding_step");
}

export async function setOnboardingStep(env: RuntimeEnv, step: string): Promise<void> {
  await setSetting(env, "onboarding_step", step);
}

export function metaEventsManagerUrl(pixelId: string | undefined): string {
  const base = "https://business.facebook.com/events_manager2/list/pixel/";
  const trimmed = pixelId?.trim();
  if (!trimmed) return base;
  return `${base}${encodeURIComponent(trimmed)}/test_events`;
}
