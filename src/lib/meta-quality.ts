import type { RuntimeEnv } from "@lib/runtime";
import { getMetaAccessToken, getMetaApiVersion, getMetaPixelId } from "@lib/settings";

const QUALITY_CACHE_TTL_SECONDS = 900;

export interface MetaMatchKeyFeedback {
  identifier: string;
  percentage: number;
}

export interface MetaEmqDiagnostic {
  name: string;
  description: string;
  solution: string;
  percentage?: number;
  affectedEventCount?: number;
}

export interface MetaEventQuality {
  eventName: string;
  emqScore?: number;
  matchKeyFeedback: MetaMatchKeyFeedback[];
  diagnostics: MetaEmqDiagnostic[];
  eventCoverage?: number;
}

export interface MetaDatasetQuality {
  fetchedAt: string;
  events: MetaEventQuality[];
  error?: string;
}

const TRACKED_EVENTS = new Set(["PageView", "ViewContent", "Lead", "CompleteRegistration"]);

const QUALITY_FIELDS = [
  "web{",
  "event_name,",
  "event_match_quality{",
  "composite_score,",
  "match_key_feedback{coverage{percentage},identifier},",
  "diagnostics{name,description,solution,percentage,affected_event_count}",
  "},",
  "event_coverage{percentage}",
  "}"
].join("");

function qualityCacheKey(pixelId: string): string {
  return `meta-quality:${pixelId}`;
}

export async function getMetaDatasetQuality(env: RuntimeEnv): Promise<MetaDatasetQuality | null> {
  const [pixelId, accessToken] = await Promise.all([getMetaPixelId(env), getMetaAccessToken(env)]);
  if (!pixelId || !accessToken) return null;

  const cacheKey = qualityCacheKey(pixelId);
  const cached = await env.LINK_CACHE.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as MetaDatasetQuality;
    } catch {
      // fall through to refresh
    }
  }

  const fresh = await fetchMetaDatasetQuality(env, pixelId, accessToken);
  if (fresh && !fresh.error) {
    await env.LINK_CACHE.put(cacheKey, JSON.stringify(fresh), { expirationTtl: QUALITY_CACHE_TTL_SECONDS });
  }
  return fresh;
}

async function fetchMetaDatasetQuality(
  env: RuntimeEnv,
  pixelId: string,
  accessToken: string
): Promise<MetaDatasetQuality> {
  const apiVersion = await getMetaApiVersion(env);
  const url = new URL(`https://graph.facebook.com/${apiVersion}/dataset_quality`);
  url.searchParams.set("dataset_id", pixelId);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", QUALITY_FIELDS);

  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetch(url.toString());
    const body = await response.json() as {
      error?: { message?: string };
      web?: Array<{
        event_name?: string;
        event_match_quality?: {
          composite_score?: number;
          match_key_feedback?: Array<{
            identifier?: string;
            coverage?: { percentage?: number };
          }>;
          diagnostics?: Array<{
            name?: string;
            description?: string;
            solution?: string;
            percentage?: number;
            affected_event_count?: number;
          }>;
        };
        event_coverage?: { percentage?: number };
      }>;
    };

    if (!response.ok || body.error) {
      return {
        fetchedAt,
        events: [],
        error: body.error?.message ?? `Meta dataset quality request failed (${response.status})`
      };
    }

    const events = (body.web ?? [])
      .filter((row) => row.event_name && TRACKED_EVENTS.has(row.event_name))
      .map((row) => ({
        eventName: row.event_name!,
        emqScore: row.event_match_quality?.composite_score,
        matchKeyFeedback: (row.event_match_quality?.match_key_feedback ?? [])
          .map((item) => ({
            identifier: item.identifier ?? "unknown",
            percentage: item.coverage?.percentage ?? 0
          }))
          .filter((item) => item.identifier !== "unknown"),
        diagnostics: (row.event_match_quality?.diagnostics ?? [])
          .map((item) => ({
            name: item.name ?? "Diagnostic",
            description: item.description ?? "",
            solution: item.solution ?? "",
            percentage: item.percentage,
            affectedEventCount: item.affected_event_count
          }))
          .filter((item) => item.description || item.name),
        eventCoverage: row.event_coverage?.percentage
      }))
      .sort((left, right) => left.eventName.localeCompare(right.eventName));

    return { fetchedAt, events };
  } catch (error) {
    return {
      fetchedAt,
      events: [],
      error: error instanceof Error ? error.message : "Meta dataset quality request failed"
    };
  }
}

export function pickMetaEventQuality(quality: MetaDatasetQuality | null, eventName: string): MetaEventQuality | undefined {
  return quality?.events.find((event) => event.eventName === eventName);
}

export function formatMatchKeyLabel(identifier: string): string {
  const labels: Record<string, string> = {
    ip_address: "IP",
    user_agent: "UA",
    external_id: "Ext ID",
    email: "Email",
    phone: "Phone",
    fbp: "fbp",
    fbc: "fbc",
    country: "Country",
    city: "City",
    state: "State",
    zip: "ZIP"
  };
  return labels[identifier] ?? identifier.replace(/_/g, " ");
}
