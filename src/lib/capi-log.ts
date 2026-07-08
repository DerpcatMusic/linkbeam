import { newId } from "@lib/id";
import type { RuntimeEnv } from "@lib/runtime";
import type { QueuedMetaEvent } from "@lib/tracking";

export type CapiLogStatus = "sent" | "failed" | "retried";

export interface CapiLogRow {
  id: string;
  event_id: string;
  link_id: string | null;
  kind: string;
  status: CapiLogStatus;
  http_status: number | null;
  meta_trace_id: string | null;
  error_message: string | null;
  attempt: number;
  payload: string;
  created_at: string;
}

export interface CapiLogEntry {
  event: QueuedMetaEvent;
  kind: string;
  attempt?: number;
}

export interface CapiDeliveryStats {
  sent: number;
  failed: number;
  retried: number;
  total: number;
  successRate: number;
}

export interface CapiMatchKeyCoverage {
  total: number;
  ip: number;
  userAgent: number;
  fbp: number;
  fbc: number;
  externalId: number;
  country: number;
  city: number;
  state: number;
  zip: number;
  geo: number;
  email: number;
}

export interface ParsedCapiLogView {
  eventName: string;
  platform?: string;
  attribution?: string;
  matchKeys: string[];
}

function capiCutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function listCapiLogsByLink(
  env: RuntimeEnv,
  linkId: string,
  limit = 20,
  days = 30
): Promise<CapiLogRow[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM capi_log
     WHERE link_id = ? AND created_at > ?
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(linkId, capiCutoffIso(days), limit)
    .all<CapiLogRow>();
  return result.results ?? [];
}

export async function getCapiDeliveryStats(
  env: RuntimeEnv,
  linkId: string,
  days = 30
): Promise<CapiDeliveryStats> {
  const result = await env.DB.prepare(
    `SELECT status, COUNT(*) AS count
     FROM capi_log
     WHERE link_id = ? AND created_at > ?
     GROUP BY status`
  )
    .bind(linkId, capiCutoffIso(days))
    .all<{ status: CapiLogStatus; count: number }>();

  const counts = Object.fromEntries((result.results ?? []).map((row) => [row.status, row.count])) as Partial<
    Record<CapiLogStatus, number>
  >;
  const sent = counts.sent ?? 0;
  const failed = counts.failed ?? 0;
  const retried = counts.retried ?? 0;
  const total = sent + failed + retried;
  return {
    sent,
    failed,
    retried,
    total,
    successRate: total > 0 ? sent / total : 0
  };
}

export async function countSentCapiConversions(
  env: RuntimeEnv,
  linkId: string,
  days = 30,
  clickEventName = "ViewContent"
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM capi_log
     WHERE link_id = ? AND created_at > ? AND status = 'sent'
       AND (kind LIKE 'click%' OR kind = 'click' OR kind LIKE 'presave%' OR kind = 'presave')
       AND json_extract(payload, '$.eventName') IN (?, 'Stream_Click', 'Lead')`
  )
    .bind(linkId, capiCutoffIso(days), clickEventName)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function countSentCapiByEventName(
  env: RuntimeEnv,
  linkId: string,
  eventName: string,
  days = 30
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM capi_log
     WHERE link_id = ? AND created_at > ? AND status = 'sent'
       AND json_extract(payload, '$.eventName') = ?`
  )
    .bind(linkId, capiCutoffIso(days), eventName)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export function parseCapiLogView(row: CapiLogRow): ParsedCapiLogView {
  const fallback = { eventName: row.kind, matchKeys: [] as string[] };
  try {
    const parsed = JSON.parse(row.payload) as {
      eventName?: string;
      platform?: string;
      ip?: string;
      userAgent?: string;
      fbp?: string;
      fbc?: string;
      externalId?: string;
      hashedEmail?: string;
      hashedCountry?: string;
      hashedCity?: string;
      hashedState?: string;
      hashedZip?: string;
      attribution?: {
        utmCampaign?: string;
        utmSource?: string;
        adId?: string;
        placement?: string;
      };
    };

    const matchKeys: string[] = [];
    if (parsed.ip) matchKeys.push("IP");
    if (parsed.userAgent) matchKeys.push("UA");
    if (parsed.fbp) matchKeys.push("fbp");
    if (parsed.fbc) matchKeys.push("fbc");
    if (parsed.externalId) matchKeys.push("ext");
    if (parsed.hashedCountry) matchKeys.push("country");
    if (parsed.hashedCity) matchKeys.push("city");
    if (parsed.hashedState) matchKeys.push("state");
    if (parsed.hashedZip) matchKeys.push("zip");
    if (parsed.hashedCountry || parsed.hashedCity || parsed.hashedState || parsed.hashedZip) matchKeys.push("geo");
    if (parsed.hashedEmail) matchKeys.push("email");

    const attributionParts = [
      parsed.attribution?.utmCampaign,
      parsed.attribution?.utmSource,
      parsed.attribution?.adId ? `ad ${parsed.attribution.adId}` : undefined,
      parsed.attribution?.placement
    ].filter(Boolean);

    return {
      eventName: parsed.eventName || row.kind,
      platform: parsed.platform,
      attribution: attributionParts.length > 0 ? attributionParts.join(" · ") : undefined,
      matchKeys
    };
  } catch {
    return fallback;
  }
}

export function analyzeCapiMatchKeys(rows: CapiLogRow[]): CapiMatchKeyCoverage {
  const coverage: CapiMatchKeyCoverage = {
    total: 0,
    ip: 0,
    userAgent: 0,
    fbp: 0,
    fbc: 0,
    externalId: 0,
    country: 0,
    city: 0,
    state: 0,
    zip: 0,
    geo: 0,
    email: 0
  };

  for (const row of rows) {
    if (row.status !== "sent") continue;
    coverage.total += 1;
    const view = parseCapiLogView(row);
    if (view.matchKeys.includes("IP")) coverage.ip += 1;
    if (view.matchKeys.includes("UA")) coverage.userAgent += 1;
    if (view.matchKeys.includes("fbp")) coverage.fbp += 1;
    if (view.matchKeys.includes("fbc")) coverage.fbc += 1;
    if (view.matchKeys.includes("ext")) coverage.externalId += 1;
    if (view.matchKeys.includes("country")) coverage.country += 1;
    if (view.matchKeys.includes("city")) coverage.city += 1;
    if (view.matchKeys.includes("state")) coverage.state += 1;
    if (view.matchKeys.includes("zip")) coverage.zip += 1;
    if (view.matchKeys.includes("geo")) coverage.geo += 1;
    if (view.matchKeys.includes("email")) coverage.email += 1;
  }

  return coverage;
}

export async function logCapiResult(
  env: RuntimeEnv,
  entry: CapiLogEntry,
  result: { status: CapiLogStatus; httpStatus?: number; metaTraceId?: string; errorMessage?: string }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO capi_log (id, event_id, link_id, kind, status, http_status, meta_trace_id, error_message, attempt, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      newId("cap"),
      entry.event.eventId,
      entry.event.linkId,
      entry.kind,
      result.status,
      result.httpStatus ?? null,
      result.metaTraceId ?? null,
      result.errorMessage ?? null,
      entry.attempt ?? 1,
      JSON.stringify(entry.event)
    )
    .run();
}

export async function listRecentCapiLogs(env: RuntimeEnv, limit = 50): Promise<CapiLogRow[]> {
  const result = await env.DB.prepare("SELECT * FROM capi_log ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all<CapiLogRow>();
  return result.results ?? [];
}

export async function markCapiLogRetried(env: RuntimeEnv, id: string): Promise<void> {
  await env.DB.prepare("UPDATE capi_log SET status = 'retried' WHERE id = ? AND status = 'failed'")
    .bind(id)
    .run();
}

export function buildCapiRetryQuery(): { sql: string; bindings: string[] } {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return {
    sql: `SELECT * FROM capi_log
          WHERE status = 'failed' AND attempt < 3 AND kind NOT LIKE '%:queue' AND created_at > ?
          ORDER BY created_at ASC
          LIMIT 50`,
    bindings: [cutoff]
  };
}

export async function getRetryableCapiLogs(env: RuntimeEnv): Promise<CapiLogRow[]> {
  const query = buildCapiRetryQuery();
  const result = await env.DB.prepare(query.sql).bind(...query.bindings).all<CapiLogRow>();
  return result.results ?? [];
}
