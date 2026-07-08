import type { RuntimeEnv } from "@lib/runtime";
import type { Platform } from "@lib/types";

export interface LinkStats {
  views: number;
  clicks: number;
  presaves: number;
  ctr: number;
  subscriberCount: number;
}

export interface TimeseriesPoint {
  day: string;
  views: number;
  clicks: number;
  presaves: number;
}

export type Granularity = "daily" | "hourly";
export type HourRange = 24 | 48 | 168;

export interface AnalyticsOptions {
  days: 7 | 30 | 90;
  view: "chart" | "table";
  unique: boolean;
  granularity: Granularity;
  hours: HourRange;
}

export interface FunnelStats {
  pageViews: number;
  viewContents: number;
  tapRate: number;
}

export interface HeatmapCell {
  weekday: number;
  hour: number;
  count: number;
}

export interface HourHeatmap {
  cells: HeatmapCell[];
  max: number;
  total: number;
}

export interface AnalyticsTableRow extends TimeseriesPoint {
  ctrLabel: string;
}

export interface PlatformClicks {
  platform: Platform;
  clicks: number;
}

export interface GeoBreakdownRow {
  country: string;
  count: number;
  share: number;
}

export interface UtmBreakdownRow {
  utm_source: string;
  utm_campaign: string;
  count: number;
  share: number;
}

export interface AnalyticsBreakdownRow {
  label: string;
  count: number;
  share: number;
}

export interface ChartMarker {
  x: number;
  viewsY: number;
  clicksY: number;
  day: string;
  label: string;
  views: number;
  clicks: number;
  presaves: number;
  tapRate: number;
  priorViews: number | null;
  priorClicks: number | null;
  deltaViews: number | null;
  deltaClicks: number | null;
}

export function formatChartDelta(delta: number | null, prior: number | null): string | null {
  if (delta === null || prior === null) return null;
  if (delta === 0) return "±0";
  const sign = delta > 0 ? "+" : "";
  const pct = prior > 0 ? (delta / prior) * 100 : null;
  const pctPart = pct !== null ? ` / ${sign}${pct.toFixed(1)}%` : "";
  return `${sign}${delta}${pctPart}`;
}

export interface DualSeriesChart {
  width: number;
  height: number;
  plotWidth: number;
  plotHeight: number;
  padding: { top: number; right: number; bottom: number; left: number };
  viewsArea: string;
  clicksArea: string;
  viewsLine: string;
  clicksLine: string;
  yTicks: Array<{ y: number; value: number; label: string }>;
  xTicks: Array<{ x: number; label: string }>;
  markers: ChartMarker[];
}

export function normalizeAnalyticsOptions(params: URLSearchParams): AnalyticsOptions {
  const range = Number(params.get("range"));
  const days = range === 7 || range === 90 ? range : 30;
  const view = params.get("view") === "table" ? "table" : "chart";
  const unique = params.get("unique") === "1";
  const granularity: Granularity = params.get("granularity") === "hourly" ? "hourly" : "daily";
  const hourRange = Number(params.get("hours"));
  const hours: HourRange = hourRange === 48 || hourRange === 168 ? hourRange : 24;
  return { days, view, unique, granularity, hours };
}

export function analyticsTableRows(points: TimeseriesPoint[]): AnalyticsTableRow[] {
  return [...points]
    .reverse()
    .map((point) => ({
      ...point,
      ctrLabel: point.views > 0 ? `${((point.clicks / point.views) * 100).toFixed(1)}%` : "—"
    }));
}

export async function getLinkStats(env: RuntimeEnv, linkId: string): Promise<LinkStats> {
  const metrics = await env.DB.prepare(
    `SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(clicks), 0) AS clicks, COALESCE(SUM(presaves), 0) AS presaves
     FROM daily_metrics WHERE link_id = ?`
  )
    .bind(linkId)
    .first<{ views: number; clicks: number; presaves: number }>();

  const subscribers = await env.DB.prepare("SELECT COUNT(*) AS count FROM subscribers WHERE link_id = ?")
    .bind(linkId)
    .first<{ count: number }>();

  const views = metrics?.views ?? 0;
  const clicks = metrics?.clicks ?? 0;
  const presaves = metrics?.presaves ?? 0;
  const ctr = views > 0 ? clicks / views : 0;

  return {
    views,
    clicks,
    presaves,
    ctr,
    subscriberCount: subscribers?.count ?? 0
  };
}

export async function getLinkTimeseries(env: RuntimeEnv, linkId: string, days: number): Promise<TimeseriesPoint[]> {
  const startDay = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const result = await env.DB.prepare(
    `SELECT day,
            COALESCE(SUM(views), 0) AS views,
            COALESCE(SUM(clicks), 0) AS clicks,
            COALESCE(SUM(presaves), 0) AS presaves
     FROM daily_metrics
     WHERE link_id = ? AND day >= ?
     GROUP BY day
     ORDER BY day ASC`
  )
    .bind(linkId, startDay)
    .all<TimeseriesPoint>();

  const byDay = new Map((result.results ?? []).map((row) => [row.day, row]));
  const points: TimeseriesPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    points.push(byDay.get(day) ?? { day, views: 0, clicks: 0, presaves: 0 });
  }
  return points;
}

export async function getUniqueTimeseries(env: RuntimeEnv, linkId: string, days: number): Promise<TimeseriesPoint[]> {
  const startDay = startDayForRange(days);
  const result = await env.DB.prepare(
    `SELECT day,
            COUNT(DISTINCT CASE WHEN kind = 'view' AND visitor_hash != '' THEN visitor_hash END) AS views,
            COUNT(DISTINCT CASE WHEN kind IN ('click', 'presave') AND visitor_hash != '' THEN visitor_hash END) AS clicks,
            COUNT(DISTINCT CASE WHEN kind IN ('presave', 'subscribe') AND visitor_hash != '' THEN visitor_hash END) AS presaves
     FROM metric_events
     WHERE link_id = ? AND day >= ?
     GROUP BY day
     ORDER BY day ASC`
  )
    .bind(linkId, startDay)
    .all<TimeseriesPoint>();

  const byDay = new Map((result.results ?? []).map((row) => [row.day, row]));
  const points: TimeseriesPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    points.push(byDay.get(day) ?? { day, views: 0, clicks: 0, presaves: 0 });
  }
  return points;
}

export async function getPlatformClicks(env: RuntimeEnv, linkId: string): Promise<PlatformClicks[]> {
  const result = await env.DB.prepare(
    `SELECT platform, COALESCE(SUM(clicks), 0) + COALESCE(SUM(presaves), 0) AS clicks
     FROM daily_metrics
     WHERE link_id = ? AND platform != ''
     GROUP BY platform
     ORDER BY clicks DESC`
  )
    .bind(linkId)
    .all<PlatformClicks>();
  return result.results ?? [];
}

export async function getLinksTimeseries(env: RuntimeEnv, linkIds: string[], days: number): Promise<Map<string, TimeseriesPoint[]>> {
  const map = new Map<string, TimeseriesPoint[]>();
  await Promise.all(
    linkIds.map(async (linkId) => {
      map.set(linkId, await getLinkTimeseries(env, linkId, days));
    })
  );
  return map;
}

function startDayForRange(days: number): string {
  return new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function getGeoBreakdown(env: RuntimeEnv, linkId: string, days: number): Promise<GeoBreakdownRow[]> {
  const startDay = startDayForRange(days);
  const result = await env.DB.prepare(
    `SELECT country, COUNT(*) AS count
     FROM metric_events
     WHERE link_id = ? AND day >= ? AND country != ''
     GROUP BY country
     ORDER BY count DESC`
  )
    .bind(linkId, startDay)
    .all<{ country: string; count: number }>();

  const rows = result.results ?? [];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.map((row) => ({
    country: row.country,
    count: row.count,
    share: total > 0 ? row.count / total : 0
  }));
}

export async function getUtmBreakdown(env: RuntimeEnv, linkId: string, days: number): Promise<UtmBreakdownRow[]> {
  const startDay = startDayForRange(days);
  const result = await env.DB.prepare(
    `SELECT utm_source, utm_campaign, COUNT(*) AS count
     FROM metric_events
     WHERE link_id = ? AND day >= ? AND (utm_source != '' OR utm_campaign != '')
     GROUP BY utm_source, utm_campaign
     ORDER BY count DESC`
  )
    .bind(linkId, startDay)
    .all<{ utm_source: string; utm_campaign: string; count: number }>();

  const rows = result.results ?? [];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.map((row) => ({
    utm_source: row.utm_source || "—",
    utm_campaign: row.utm_campaign || "—",
    count: row.count,
    share: total > 0 ? row.count / total : 0
  }));
}

export async function getDeviceBreakdown(env: RuntimeEnv, linkId: string, days: number): Promise<AnalyticsBreakdownRow[]> {
  return getSingleColumnBreakdown(env, linkId, days, "device_type");
}

export async function getBrowserBreakdown(env: RuntimeEnv, linkId: string, days: number): Promise<AnalyticsBreakdownRow[]> {
  return getSingleColumnBreakdown(env, linkId, days, "browser_name");
}

export async function getOsBreakdown(env: RuntimeEnv, linkId: string, days: number): Promise<AnalyticsBreakdownRow[]> {
  return getSingleColumnBreakdown(env, linkId, days, "os_name");
}

async function getSingleColumnBreakdown(
  env: RuntimeEnv,
  linkId: string,
  days: number,
  column: "device_type" | "browser_name" | "os_name"
): Promise<AnalyticsBreakdownRow[]> {
  const startDay = startDayForRange(days);
  const result = await env.DB.prepare(
    `SELECT ${column} AS label, COUNT(*) AS count
     FROM metric_events
     WHERE link_id = ? AND day >= ? AND ${column} != ''
     GROUP BY ${column}
     ORDER BY count DESC`
  )
    .bind(linkId, startDay)
    .all<{ label: string; count: number }>();

  return withShares(result.results ?? []);
}

function withShares(rows: Array<{ label: string; count: number }>): AnalyticsBreakdownRow[] {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.map((row) => ({
    label: row.label,
    count: row.count,
    share: total > 0 ? row.count / total : 0
  }));
}

export async function getUniqueVisitors(env: RuntimeEnv, linkId: string, days: number): Promise<number> {
  const startDay = startDayForRange(days);
  const row = await env.DB.prepare(
    `SELECT COUNT(DISTINCT visitor_hash) AS count
     FROM metric_events
     WHERE link_id = ? AND day >= ? AND visitor_hash != ''`
  )
    .bind(linkId, startDay)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getFunnelStats(env: RuntimeEnv, linkId: string, days: number): Promise<FunnelStats> {
  const startDay = startDayForRange(days);
  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'view' THEN 1 ELSE 0 END), 0) AS pageViews,
       COALESCE(SUM(CASE WHEN kind = 'click' THEN 1 ELSE 0 END), 0) AS viewContents
     FROM metric_events
     WHERE link_id = ? AND day >= ?`
  )
    .bind(linkId, startDay)
    .first<{ pageViews: number; viewContents: number }>();
  const pageViews = row?.pageViews ?? 0;
  const viewContents = row?.viewContents ?? 0;
  return { pageViews, viewContents, tapRate: pageViews > 0 ? viewContents / pageViews : 0 };
}

export async function getHourlyTimeseries(env: RuntimeEnv, linkId: string, hours: number): Promise<TimeseriesPoint[]> {
  const now = new Date();
  const currentHourMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours());
  const startMs = currentHourMs - (hours - 1) * 3_600_000;
  const cutoffIso = new Date(startMs).toISOString();
  const result = await env.DB.prepare(
    `SELECT substr(created_at, 1, 13) AS bucket,
            COALESCE(SUM(CASE WHEN kind = 'view' THEN 1 ELSE 0 END), 0) AS views,
            COALESCE(SUM(CASE WHEN kind = 'click' THEN 1 ELSE 0 END), 0) AS clicks
     FROM metric_events
     WHERE link_id = ? AND created_at >= ?
     GROUP BY bucket
     ORDER BY bucket ASC`
  )
    .bind(linkId, cutoffIso)
    .all<{ bucket: string; views: number; clicks: number }>();

  const byBucket = new Map((result.results ?? []).map((row) => [row.bucket, row]));
  const points: TimeseriesPoint[] = [];
  for (let index = 0; index < hours; index += 1) {
    const bucket = new Date(startMs + index * 3_600_000).toISOString().slice(0, 13);
    const row = byBucket.get(bucket);
    points.push({ day: bucket, views: row?.views ?? 0, clicks: row?.clicks ?? 0, presaves: 0 });
  }
  return points;
}

export async function getHourHeatmap(env: RuntimeEnv, linkId: string, days: number): Promise<HourHeatmap> {
  const startDay = startDayForRange(days);
  const result = await env.DB.prepare(
    `SELECT CAST(strftime('%w', substr(created_at, 1, 10)) AS INTEGER) AS weekday,
            CAST(substr(created_at, 12, 2) AS INTEGER) AS hour,
            COUNT(*) AS count
     FROM metric_events
     WHERE link_id = ? AND day >= ? AND kind = 'click'
     GROUP BY weekday, hour`
  )
    .bind(linkId, startDay)
    .all<{ weekday: number; hour: number; count: number }>();

  const cells = (result.results ?? []).map((row) => ({ weekday: row.weekday, hour: row.hour, count: row.count }));
  return {
    cells,
    max: cells.reduce((peak, cell) => Math.max(peak, cell.count), 0),
    total: cells.reduce((sum, cell) => sum + cell.count, 0)
  };
}

// Whitelisted columns for attribution breakdowns — never interpolate user input here.
const EVENT_BREAKDOWN_COLUMNS = ["utm_campaign", "ad_id", "adset_id", "placement", "city"] as const;
type EventBreakdownColumn = typeof EVENT_BREAKDOWN_COLUMNS[number];

async function getEventBreakdown(
  env: RuntimeEnv,
  linkId: string,
  days: number,
  column: EventBreakdownColumn
): Promise<AnalyticsBreakdownRow[]> {
  const startDay = startDayForRange(days);
  const result = await env.DB.prepare(
    `SELECT ${column} AS label, COUNT(*) AS count
     FROM metric_events
     WHERE link_id = ? AND day >= ? AND kind = 'click' AND ${column} != ''
     GROUP BY ${column}
     ORDER BY count DESC`
  )
    .bind(linkId, startDay)
    .all<{ label: string; count: number }>();
  return withShares(result.results ?? []);
}

export function getCampaignBreakdown(env: RuntimeEnv, linkId: string, days: number): Promise<AnalyticsBreakdownRow[]> {
  return getEventBreakdown(env, linkId, days, "utm_campaign");
}

export interface LinkCampaignAttributionRow {
  campaignKey: string;
  campaignId: string;
  nameHint: string;
  count: number;
}

export async function getLinkCampaignAttribution(
  env: RuntimeEnv,
  linkId: string,
  days: number
): Promise<LinkCampaignAttributionRow[]> {
  const startDay = startDayForRange(days);
  const result = await env.DB.prepare(
    `SELECT
       COALESCE(NULLIF(campaign_id, ''), NULLIF(utm_campaign, '')) AS campaign_key,
       MAX(CASE WHEN campaign_id != '' THEN campaign_id ELSE '' END) AS campaign_id,
       MAX(utm_campaign) AS utm_campaign,
       COUNT(*) AS count
     FROM metric_events
     WHERE link_id = ? AND day >= ? AND kind = 'click'
       AND (campaign_id != '' OR utm_campaign != '')
     GROUP BY campaign_key
     ORDER BY count DESC`
  )
    .bind(linkId, startDay)
    .all<{ campaign_key: string; campaign_id: string; utm_campaign: string; count: number }>();

  return (result.results ?? []).map((row) => {
    const utm = row.utm_campaign?.trim() ?? "";
    const campaignId = row.campaign_id?.trim() ?? "";
    const numericUtm = /^\d{5,}$/.test(utm);
    return {
      campaignKey: row.campaign_key,
      campaignId: campaignId || (numericUtm ? utm : ""),
      nameHint: utm && !numericUtm ? utm : "",
      count: row.count
    };
  });
}

export function getAdBreakdown(env: RuntimeEnv, linkId: string, days: number): Promise<AnalyticsBreakdownRow[]> {
  return getEventBreakdown(env, linkId, days, "ad_id");
}

export function getPlacementBreakdown(env: RuntimeEnv, linkId: string, days: number): Promise<AnalyticsBreakdownRow[]> {
  return getEventBreakdown(env, linkId, days, "placement");
}

export function getCityBreakdown(env: RuntimeEnv, linkId: string, days: number): Promise<AnalyticsBreakdownRow[]> {
  return getEventBreakdown(env, linkId, days, "city");
}

export async function getReferrerBreakdown(env: RuntimeEnv, linkId: string, days: number): Promise<AnalyticsBreakdownRow[]> {
  const startDay = startDayForRange(days);
  const result = await env.DB.prepare(
    `SELECT referrer AS label, COUNT(*) AS count
     FROM metric_events
     WHERE link_id = ? AND day >= ? AND kind = 'click' AND referrer != ''
     GROUP BY referrer`
  )
    .bind(linkId, startDay)
    .all<{ label: string; count: number }>();

  const byHost = new Map<string, number>();
  for (const row of result.results ?? []) {
    const host = referrerHost(row.label);
    byHost.set(host, (byHost.get(host) ?? 0) + row.count);
  }
  const rows = [...byHost.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  return withShares(rows);
}

export function referrerHost(referrer: string): string {
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return referrer.slice(0, 40) || "direct";
  }
}

function smoothLinePath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;

  let path = `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
  for (let index = 0; index < coords.length - 1; index += 1) {
    const current = coords[index];
    const next = coords[index + 1];
    const controlX = (current.x + next.x) / 2;
    path += ` C${controlX.toFixed(2)},${current.y.toFixed(2)} ${controlX.toFixed(2)},${next.y.toFixed(2)} ${next.x.toFixed(2)},${next.y.toFixed(2)}`;
  }
  return path;
}

function areaPathFromLine(linePath: string, baselineY: number, endX: number): string {
  if (!linePath) return "";
  return `${linePath} L${endX.toFixed(2)},${baselineY.toFixed(2)} Z`;
}

function formatTick(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(0)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

function formatDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatHourLabel(bucket: string): string {
  const date = new Date(`${bucket}:00:00Z`);
  if (Number.isNaN(date.getTime())) return bucket;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", timeZone: "UTC" });
}

export function buildDualSeriesChart(
  points: TimeseriesPoint[],
  { width = 640, height = 200, labelFormat = "day" }: { width?: number; height?: number; labelFormat?: "day" | "hour" } = {}
): DualSeriesChart {
  const formatLabel = labelFormat === "hour" ? formatHourLabel : formatDayLabel;
  const padding = { top: 12, right: 12, bottom: 28, left: 40 };
  const plotWidth = Math.max(width - padding.left - padding.right, 1);
  const plotHeight = Math.max(height - padding.top - padding.bottom, 1);
  const baselineY = padding.top + plotHeight;
  const maxValue = Math.max(...points.map((point) => Math.max(point.views, point.clicks)), 1);
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const markers: ChartMarker[] = points.map((point, index) => {
    const prior = index > 0 ? points[index - 1] : null;
    const x = padding.left + index * step;
    const viewsY = padding.top + plotHeight - (point.views / maxValue) * plotHeight;
    const clicksY = padding.top + plotHeight - (point.clicks / maxValue) * plotHeight;
    return {
      x,
      viewsY,
      clicksY,
      day: point.day,
      label: formatLabel(point.day),
      views: point.views,
      clicks: point.clicks,
      presaves: point.presaves,
      tapRate: point.views > 0 ? point.clicks / point.views : 0,
      priorViews: prior?.views ?? null,
      priorClicks: prior?.clicks ?? null,
      deltaViews: prior !== null ? point.views - prior.views : null,
      deltaClicks: prior !== null ? point.clicks - prior.clicks : null
    };
  });

  const viewsCoords = markers.map((marker) => ({ x: marker.x, y: marker.viewsY }));
  const clicksCoords = markers.map((marker) => ({ x: marker.x, y: marker.clicksY }));
  const viewsLine = smoothLinePath(viewsCoords);
  const clicksLine = smoothLinePath(clicksCoords);
  const endX = padding.left + plotWidth;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = maxValue * ratio;
    const y = padding.top + plotHeight - ratio * plotHeight;
    return { y, value, label: formatTick(value) };
  });

  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const xTicks = markers
    .filter((_, index) => index % labelEvery === 0 || index === markers.length - 1)
    .map((marker) => ({ x: marker.x, label: marker.label }));

  return {
    width,
    height,
    plotWidth,
    plotHeight,
    padding,
    viewsArea: areaPathFromLine(viewsLine, baselineY, endX),
    clicksArea: areaPathFromLine(clicksLine, baselineY, endX),
    viewsLine,
    clicksLine,
    yTicks,
    xTicks,
    markers
  };
}

export function sparklinePath(points: TimeseriesPoint[], width = 80, height = 24): string {
  const values = points.map((point) => point.views + point.clicks);
  const max = Math.max(...values, 1);
  if (points.length === 0) return "";
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = values.map((value, index) => ({
    x: index * step,
    y: height - (value / max) * height
  }));
  return smoothLinePath(coords);
}

export function barChartBars(points: TimeseriesPoint[], width = 600, height = 120): Array<{ x: number; y: number; w: number; h: number; day: string }> {
  const values = points.map((point) => point.views + point.clicks);
  const max = Math.max(...values, 1);
  const barWidth = width / Math.max(points.length, 1);
  const gap = Math.min(2, barWidth * 0.15);
  return points.map((point, index) => {
    const value = point.views + point.clicks;
    const h = (value / max) * height;
    return {
      x: index * barWidth + gap / 2,
      y: height - h,
      w: Math.max(barWidth - gap, 1),
      h,
      day: point.day
    };
  });
}
