import { passwordAuthConfigured } from "@lib/admin-session";
import { listLinks } from "@lib/db";
import type { RuntimeEnv } from "@lib/runtime";
import {
  getMetaAccessToken,
  getMetaPixelId,
  getSetting,
  isOnboardingCompleted
} from "@lib/settings";

export const ONBOARDING_STEPS = [
  { id: "welcome", title: "Welcome", optional: false },
  { id: "resources", title: "Cloudflare", optional: false },
  { id: "secrets", title: "Secrets", optional: false },
  { id: "database", title: "Database", optional: false },
  { id: "auth", title: "Admin auth", optional: true },
  { id: "first-link", title: "First link", optional: true },
  { id: "pixel", title: "Pixel test", optional: true },
  { id: "complete", title: "Done", optional: false }
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];

export interface OnboardingBindings {
  db: boolean;
  kv: boolean;
  r2: boolean;
  queue: boolean;
  analytics: boolean;
}

export interface OnboardingSecrets {
  metaPixelId: boolean;
  metaAccessToken: boolean;
  spotifyClientId: boolean;
  spotifyClientSecret: boolean;
}

export interface OnboardingAuth {
  cloudflareAccess: boolean;
  passwordAuth: boolean;
  configured: boolean;
}

export interface OnboardingStatus {
  completed: boolean;
  currentStep: OnboardingStepId;
  skippedSteps: OnboardingStepId[];
  bindings: OnboardingBindings;
  secrets: OnboardingSecrets;
  auth: OnboardingAuth;
  databaseMigrated: boolean;
  linkCount: number;
  pixelConfigured: boolean;
  capiConfigured: boolean;
  publicBaseUrl: string;
  isDev: boolean;
}

const DEFAULT_WORKER_NAME = "beamlink";

export function workerNameFromEnv(env?: Pick<Env, "WORKER_NAME">): string {
  const configured = env?.WORKER_NAME?.trim();
  return configured || DEFAULT_WORKER_NAME;
}

export function wranglerResourceCommands(workerName = DEFAULT_WORKER_NAME): string {
  return [
    `wrangler d1 create ${workerName}`,
    `wrangler kv namespace create LINK_CACHE`,
    `wrangler r2 bucket create ${workerName}-artwork`,
    `wrangler queues create ${workerName}-conversions`,
    `wrangler queues create ${workerName}-conversions-dlq`
  ].join("\n");
}

export function wranglerSecretCommands(): string {
  return [
    "wrangler secret put META_PIXEL_ID",
    "wrangler secret put META_ACCESS_TOKEN",
    "wrangler secret put SPOTIFY_CLIENT_ID",
    "wrangler secret put SPOTIFY_CLIENT_SECRET",
    "wrangler secret put CF_ACCESS_TEAM_DOMAIN",
    "wrangler secret put CF_ACCESS_AUD",
    "wrangler secret put ADMIN_PASSWORD_HASH",
    "wrangler secret put ADMIN_SESSION_SECRET",
    "wrangler secret put RATE_LIMIT_SECRET"
  ].join("\n");
}

export function wranglerBindingsSnippet(options?: {
  workerName?: string;
  d1Id?: string;
  kvId?: string;
  publicBaseUrl?: string;
}): string {
  const workerName = options?.workerName ?? DEFAULT_WORKER_NAME;
  const d1Id = options?.d1Id ?? "<D1_DATABASE_ID>";
  const kvId = options?.kvId ?? "<KV_NAMESPACE_ID>";
  const publicBaseUrl = options?.publicBaseUrl ?? "https://links.example.com";

  return `{
  "name": "${workerName}",
  "d1_databases": [{
    "binding": "DB",
    "database_name": "${workerName}",
    "database_id": "${d1Id}"
  }],
  "kv_namespaces": [{
    "binding": "LINK_CACHE",
    "id": "${kvId}"
  }],
  "r2_buckets": [{
    "binding": "ARTWORK",
    "bucket_name": "${workerName}-artwork"
  }],
  "queues": {
    "producers": [{
      "binding": "CONVERSION_EVENTS",
      "queue": "${workerName}-conversions"
    }],
    "consumers": [{
      "queue": "${workerName}-conversions",
      "max_batch_size": 10,
      "max_batch_timeout": 5,
      "max_retries": 5,
      "dead_letter_queue": "${workerName}-conversions-dlq"
    }]
  },
  "analytics_engine_datasets": [{
    "binding": "ANALYTICS",
    "dataset": "${workerName.replace(/-/g, "_")}_events"
  }],
  "vars": {
    "PUBLIC_BASE_URL": "${publicBaseUrl}"
  }
}`;
}

export function wranglerMigrationCommands(): string {
  return ["bun run db:migrate:local", "bun run db:migrate"].join("\n");
}

export function parseSkippedSteps(raw: string | undefined): OnboardingStepId[] {
  if (!raw) return [];
  const valid = new Set(ONBOARDING_STEPS.map((step) => step.id));
  return raw
    .split(",")
    .map((step) => step.trim())
    .filter((step): step is OnboardingStepId => valid.has(step as OnboardingStepId));
}

export function serializeSkippedSteps(steps: Iterable<OnboardingStepId>): string {
  return [...new Set(steps)].join(",");
}

async function databaseMigrated(env: RuntimeEnv): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'links'"
    ).first<{ name: string }>();
    return Boolean(row);
  } catch {
    return false;
  }
}

async function databaseReachable(env: RuntimeEnv): Promise<boolean> {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return true;
  } catch {
    return false;
  }
}

function bindingPresent<T>(value: T | undefined): boolean {
  return value !== undefined && value !== null;
}

export function stepIndex(stepId: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((step) => step.id === stepId);
}

export function nextStepId(stepId: OnboardingStepId): OnboardingStepId | null {
  const index = stepIndex(stepId);
  if (index < 0 || index >= ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[index + 1].id;
}

export function previousStepId(stepId: OnboardingStepId): OnboardingStepId | null {
  const index = stepIndex(stepId);
  if (index <= 0) return null;
  return ONBOARDING_STEPS[index - 1].id;
}

export function normalizeStepId(raw: string | null | undefined): OnboardingStepId {
  const match = ONBOARDING_STEPS.find((step) => step.id === raw);
  return match?.id ?? "welcome";
}

export async function getOnboardingStatus(
  env: RuntimeEnv,
  options?: { step?: string | null; isDev?: boolean; publicBaseUrl?: string }
): Promise<OnboardingStatus> {
  const isDev = options?.isDev ?? false;
  const [
    completed,
    savedStep,
    skippedRaw,
    metaPixelId,
    metaAccessToken,
    migrated,
    links,
    dbReachable
  ] = await Promise.all([
    isOnboardingCompleted(env),
    getSetting(env, "onboarding_step"),
    getSetting(env, "onboarding_skipped_steps"),
    getMetaPixelId(env),
    getMetaAccessToken(env),
    databaseMigrated(env),
    listLinks(env).catch(() => []),
    databaseReachable(env)
  ]);

  const skippedSteps = parseSkippedSteps(skippedRaw);
  const requestedStep = normalizeStepId(options?.step ?? savedStep ?? "welcome");
  const bindings: OnboardingBindings = {
    db: dbReachable,
    kv: bindingPresent(env.LINK_CACHE),
    r2: bindingPresent(env.ARTWORK),
    queue: bindingPresent(env.CONVERSION_EVENTS),
    analytics: bindingPresent(env.ANALYTICS)
  };

  const secrets: OnboardingSecrets = {
    metaPixelId: Boolean(metaPixelId?.trim() || env.META_PIXEL_ID?.trim()),
    metaAccessToken: Boolean(metaAccessToken?.trim() || env.META_ACCESS_TOKEN?.trim()),
    spotifyClientId: Boolean(env.SPOTIFY_CLIENT_ID?.trim()),
    spotifyClientSecret: Boolean(env.SPOTIFY_CLIENT_SECRET?.trim())
  };

  const auth: OnboardingAuth = {
    cloudflareAccess: Boolean(env.CF_ACCESS_TEAM_DOMAIN?.trim() && env.CF_ACCESS_AUD?.trim()),
    passwordAuth: passwordAuthConfigured(env),
    configured: false
  };
  auth.configured = auth.cloudflareAccess || auth.passwordAuth || isDev;

  const pixelConfigured = secrets.metaPixelId;
  const capiConfigured = pixelConfigured && secrets.metaAccessToken;

  return {
    completed,
    currentStep: requestedStep,
    skippedSteps,
    bindings,
    secrets,
    auth,
    databaseMigrated: migrated,
    linkCount: links.length,
    pixelConfigured,
    capiConfigured,
    publicBaseUrl: options?.publicBaseUrl ?? env.PUBLIC_BASE_URL ?? "",
    isDev
  };
}

export function stepComplete(status: OnboardingStatus, stepId: OnboardingStepId): boolean {
  if (status.skippedSteps.includes(stepId)) return true;

  switch (stepId) {
    case "welcome":
      return true;
    case "resources":
      return status.bindings.db && status.bindings.kv && status.bindings.r2 && status.bindings.queue;
    case "secrets":
      return status.secrets.metaPixelId && status.secrets.metaAccessToken;
    case "database":
      return status.databaseMigrated;
    case "auth":
      return status.auth.configured;
    case "first-link":
      return status.linkCount > 0;
    case "pixel":
      return status.capiConfigured;
    case "complete":
      return status.completed;
    default:
      return false;
  }
}
