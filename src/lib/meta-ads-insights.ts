import type { RuntimeEnv } from "@lib/runtime";
import { getMetaAccessToken, getMetaAdAccountId, getMetaApiVersion, getMetaCurrency, normalizeAdAccountId } from "@lib/settings";

const INSIGHTS_CACHE_TTL_SECONDS = 900;

export interface MetaCampaignInsightRow {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  metaResults: number;
  costPerResult: number | null;
}

export interface MetaAdsInsights {
  fetchedAt: string;
  currency: string;
  campaigns: MetaCampaignInsightRow[];
  error?: string;
}

export interface CampaignAttributionRow {
  campaignKey: string;
  campaignId: string;
  nameHint: string;
  count: number;
}

export interface CampaignPerformanceRow {
  campaignId: string;
  displayName: string;
  yourTaps: number;
  spend: number | null;
  impressions: number | null;
  metaClicks: number | null;
  metaResults: number | null;
  costPerYourTap: number | null;
  costPerMetaResult: number | null;
}

interface MetaActionRow {
  action_type?: string;
  value?: string;
}

interface MetaInsightApiRow {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaActionRow[];
  cost_per_action_type?: MetaActionRow[];
}

function insightsCacheKey(adAccountId: string, days: number): string {
  return `meta-insights:${adAccountId}:${days}`;
}

function insightDateRange(days: number): { since: string; until: string } {
  const until = new Date();
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
  return {
    since: since.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10)
  };
}

export function isNumericCampaignId(value: string | undefined | null): boolean {
  return /^\d{5,}$/.test(value?.trim() ?? "");
}

export function matchesConversionAction(actionType: string, eventName: string): boolean {
  const normalized = actionType.toLowerCase();
  const target = eventName.toLowerCase();
  if (normalized === target) return true;
  if (target === "viewcontent" && normalized.includes("view_content")) return true;
  if (target === "stream_click" && normalized.includes("stream")) return true;
  if (target === "lead" && normalized.includes("lead")) return true;
  return normalized.endsWith(`.${target}`) || normalized.includes(`_${target}`);
}

export function actionCount(actions: MetaActionRow[] | undefined, eventName: string): number {
  if (!actions?.length) return 0;
  return actions
    .filter((row) => row.action_type && matchesConversionAction(row.action_type, eventName))
    .reduce((sum, row) => sum + Number(row.value ?? 0), 0);
}

export function costPerAction(actions: MetaActionRow[] | undefined, eventName: string): number | null {
  if (!actions?.length) return null;
  const row = actions.find((item) => item.action_type && matchesConversionAction(item.action_type, eventName));
  const value = row?.value ? Number(row.value) : NaN;
  return Number.isFinite(value) ? value : null;
}

function parseInsightRow(row: MetaInsightApiRow, eventName: string): MetaCampaignInsightRow | null {
  const campaignId = row.campaign_id?.trim();
  if (!campaignId) return null;
  const metaResults = actionCount(row.actions, eventName);
  const spend = Number(row.spend ?? 0);
  return {
    campaignId,
    campaignName: row.campaign_name?.trim() || campaignId,
    spend: Number.isFinite(spend) ? spend : 0,
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    metaResults,
    costPerResult: costPerAction(row.cost_per_action_type, eventName)
  };
}

async function fetchInsightsPage(
  url: URL,
  accessToken: string
): Promise<{ rows: MetaInsightApiRow[]; error?: string }> {
  const rows: MetaInsightApiRow[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const response = await fetch(nextUrl);
    const body = await response.json() as {
      error?: { message?: string };
      data?: MetaInsightApiRow[];
      paging?: { next?: string };
    };
    if (!response.ok || body.error) {
      return { rows, error: body.error?.message ?? `Meta insights request failed (${response.status})` };
    }
    rows.push(...(body.data ?? []));
    nextUrl = body.paging?.next ?? null;
    if (nextUrl && !nextUrl.includes("access_token=")) {
      const parsed = new URL(nextUrl);
      parsed.searchParams.set("access_token", accessToken);
      nextUrl = parsed.toString();
    }
  }

  return { rows };
}

export async function getMetaAdsInsights(env: RuntimeEnv, days: number, eventName = "ViewContent"): Promise<MetaAdsInsights | null> {
  const [adAccountId, accessToken] = await Promise.all([getMetaAdAccountId(env), getMetaAccessToken(env)]);
  if (!adAccountId || !accessToken) return null;

  const cacheKey = insightsCacheKey(adAccountId, days);
  const cached = await env.LINK_CACHE.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as MetaAdsInsights;
    } catch {
      // refresh below
    }
  }

  const fresh = await fetchMetaAdsInsights(env, adAccountId, accessToken, days, eventName);
  if (!fresh.error) {
    await env.LINK_CACHE.put(cacheKey, JSON.stringify(fresh), { expirationTtl: INSIGHTS_CACHE_TTL_SECONDS });
  }
  return fresh;
}

async function fetchMetaAdsInsights(
  env: RuntimeEnv,
  adAccountId: string,
  accessToken: string,
  days: number,
  eventName: string
): Promise<MetaAdsInsights> {
  const apiVersion = await getMetaApiVersion(env);
  const currency = getMetaCurrency(env);
  const fetchedAt = new Date().toISOString();
  const range = insightDateRange(days);
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${adAccountId}/insights`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set(
    "fields",
    "campaign_id,campaign_name,spend,impressions,clicks,actions,cost_per_action_type"
  );
  url.searchParams.set("level", "campaign");
  url.searchParams.set("limit", "100");
  url.searchParams.set("time_range", JSON.stringify(range));

  try {
    const { rows, error } = await fetchInsightsPage(url, accessToken);
    if (error) {
      return { fetchedAt, currency, campaigns: [], error };
    }

    const campaigns = rows
      .map((row) => parseInsightRow(row, eventName))
      .filter((row): row is MetaCampaignInsightRow => row !== null)
      .sort((left, right) => right.spend - left.spend || right.metaResults - left.metaResults);

    return { fetchedAt, currency, campaigns };
  } catch (error) {
    return {
      fetchedAt,
      currency,
      campaigns: [],
      error: error instanceof Error ? error.message : "Meta insights request failed"
    };
  }
}

export async function resolveCampaignNames(
  env: RuntimeEnv,
  campaignIds: string[]
): Promise<Map<string, string>> {
  const accessToken = await getMetaAccessToken(env);
  const unique = [...new Set(campaignIds.filter(isNumericCampaignId))];
  const names = new Map<string, string>();
  if (!accessToken || unique.length === 0) return names;

  const apiVersion = await getMetaApiVersion(env);
  for (let index = 0; index < unique.length; index += 50) {
    const chunk = unique.slice(index, index + 50);
    const url = new URL(`https://graph.facebook.com/${apiVersion}/`);
    url.searchParams.set("ids", chunk.join(","));
    url.searchParams.set("fields", "name");
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url.toString());
    const body = await response.json() as {
      error?: { message?: string };
      [id: string]: { name?: string } | { message?: string } | undefined;
    };
    if (!response.ok || body.error) break;
    for (const id of chunk) {
      const row = body[id];
      if (row && typeof row === "object" && "name" in row && row.name) {
        names.set(id, row.name);
      }
    }
  }
  return names;
}

export function buildCampaignPerformance(
  local: CampaignAttributionRow[],
  insights: MetaAdsInsights | null,
  nameOverrides: Map<string, string> = new Map()
): CampaignPerformanceRow[] {
  const metaById = new Map((insights?.campaigns ?? []).map((row) => [row.campaignId, row]));
  const metaByName = new Map(
    (insights?.campaigns ?? []).map((row) => [row.campaignName.trim().toLowerCase(), row])
  );

  const rows = local.map((localRow) => {
    const id = localRow.campaignId || (isNumericCampaignId(localRow.campaignKey) ? localRow.campaignKey : "");
    let meta = id ? metaById.get(id) : undefined;
    if (!meta && localRow.nameHint) {
      meta = metaByName.get(localRow.nameHint.trim().toLowerCase());
    }

    const displayName =
      meta?.campaignName
      || (id ? nameOverrides.get(id) : undefined)
      || localRow.nameHint
      || localRow.campaignKey;

    const spend = meta?.spend ?? null;
    const yourTaps = localRow.count;
    return {
      campaignId: id || localRow.campaignKey,
      displayName,
      yourTaps,
      spend,
      impressions: meta?.impressions ?? null,
      metaClicks: meta?.clicks ?? null,
      metaResults: meta?.metaResults ?? null,
      costPerYourTap: spend !== null && yourTaps > 0 ? spend / yourTaps : null,
      costPerMetaResult: meta?.costPerResult ?? (spend !== null && meta?.metaResults ? spend / meta.metaResults : null)
    };
  });

  return rows.sort((left, right) => (right.spend ?? 0) - (left.spend ?? 0) || right.yourTaps - left.yourTaps);
}

export function formatAdMoney(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export { normalizeAdAccountId };
