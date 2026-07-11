import { newId, normalizeIsrc, assertSlug } from "@lib/id";
import { effectiveLinkMode } from "@lib/effective-mode";
import { DEFAULT_BUTTON_STYLE, DEFAULT_PAGE_BACKGROUND_STYLE, normalizeButtonStyle, normalizePageBackgroundStyle } from "@lib/page-style";
import {
  DEFAULT_PAGE_STYLE_OPTIONS,
  normalizePageStyleOptions,
  parsePageStyleOptionsJson,
  serializePageStyleOptions,
  type PageStyleOptions
} from "@lib/page-style-options";
import type { Destination, ImportedTrack, LinkMode, Platform, SmartLink, Track } from "@lib/types";
import { platformLabels } from "@lib/types";
import type { RuntimeEnv } from "@lib/runtime";
import { defaultSpotifyOpenBehavior } from "@lib/spotify-links";

const PUBLISHED_LINK_TTL = 60;

type LinkRow = {
  id: string;
  track_id: string;
  link_name: string;
  slug: string;
  mode: LinkMode;
  status: SmartLink["status"];
  meta_event_name?: string;
  view_event_name?: string;
  click_event_name?: string | null;
  paid_click_event_name?: string | null;
  learning_click_event_name?: SmartLink["learning_click_event_name"];
  spotify_open_behavior?: string | null;
  spotify_context_url?: string | null;
  page_background_style?: string | null;
  button_style?: string | null;
  page_style_options?: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export async function getPublishedLink(env: RuntimeEnv, slug: string): Promise<SmartLink | null> {
  const cached = await env.LINK_CACHE.get<SmartLink>(cacheKey(slug), "json");
  if (cached) return applyEffectiveMode(cached);

  const link = await getLinkBySlug(env, slug, true);
  if (!link) return null;
  const resolved = applyEffectiveMode(link);
  await env.LINK_CACHE.put(cacheKey(slug), JSON.stringify(resolved), { expirationTtl: PUBLISHED_LINK_TTL });
  return resolved;
}

export function applyEffectiveMode(link: SmartLink): SmartLink {
  const mode = effectiveLinkMode(link);
  if (mode === link.mode) return link;
  return { ...link, mode };
}

export async function getLinkBySlug(env: RuntimeEnv, slug: string, publishedOnly = false): Promise<SmartLink | null> {
  const query = publishedOnly
    ? "SELECT * FROM links WHERE slug = ? AND status = 'published'"
    : "SELECT * FROM links WHERE slug = ?";
  const row = await env.DB.prepare(query).bind(slug).first<LinkRow>();
  if (!row) return null;
  return hydrateLink(env, row);
}

export async function getLinkById(env: RuntimeEnv, id: string): Promise<SmartLink | null> {
  const row = await env.DB.prepare("SELECT * FROM links WHERE id = ?").bind(id).first<LinkRow>();
  if (!row) return null;
  return hydrateLink(env, row);
}

export async function listLinks(env: RuntimeEnv): Promise<SmartLink[]> {
  const result = await env.DB.prepare("SELECT * FROM links ORDER BY updated_at DESC LIMIT 100").all<LinkRow>();
  const rows = result.results ?? [];
  return Promise.all(rows.map((row: LinkRow) => hydrateLink(env, row))).then((links) => links.filter(Boolean) as SmartLink[]);
}

export async function upsertTrackFromImport(env: RuntimeEnv, imported: ImportedTrack, trackId?: string): Promise<Track> {
  if (!imported.title) throw new Error("Imported track is missing title.");
  const artistNames = normalizedArtistNames(imported);
  if (artistNames.length === 0) throw new Error("Imported track is missing artist.");

  const isrc = imported.isrc ? normalizeIsrc(imported.isrc) : null;
  const artists = [];
  for (const name of artistNames) artists.push(await getOrCreateArtist(env, name));
  const primaryArtist = artists[0];
  const existing = await findExistingTrack(env, { trackId, isrc, sourceUrl: imported.sourceUrl });

  if (existing) {
    await env.DB.prepare(
      `UPDATE tracks
       SET title = ?, isrc = COALESCE(?, isrc), artist_id = ?, artwork_url = COALESCE(?, artwork_url), source_url = ?, source_provider = ?,
           release_at = COALESCE(?, release_at), live_at = COALESCE(?, live_at), palette = COALESCE(?, palette),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    )
      .bind(
        imported.title,
        isrc,
        primaryArtist.id,
        imported.artworkUrl ?? null,
        imported.sourceUrl,
        imported.provider,
        imported.releaseAt ?? null,
        imported.liveAt ?? null,
        imported.palette ? JSON.stringify(imported.palette) : null,
        existing.id
      )
      .run();
    await replaceTrackArtists(env, existing.id, artists);
    const updated = await getTrackById(env, existing.id);
    if (!updated) throw new Error("Track update failed.");
    return updated;
  }

  const id = newId("trk");
  await env.DB.prepare(
    `INSERT INTO tracks (id, isrc, title, artist_id, artwork_url, source_url, source_provider, release_at, live_at, palette)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      isrc,
      imported.title,
      primaryArtist.id,
      imported.artworkUrl ?? null,
      imported.sourceUrl,
      imported.provider,
      imported.releaseAt ?? null,
      imported.liveAt ?? null,
      imported.palette ? JSON.stringify(imported.palette) : null
    )
    .run();
  await replaceTrackArtists(env, id, artists);

  const track = await getTrackById(env, id);
  if (!track) throw new Error("Track creation failed.");
  return track;
}

export async function createLink(env: RuntimeEnv, input: {
  linkName: string;
  slug: string;
  trackId: string;
  mode: LinkMode;
  destinations: Partial<Record<Platform, string>>;
  status?: SmartLink["status"];
  releaseAt?: string | null;
  spotifyOpenBehavior?: SmartLink["spotify_open_behavior"];
  spotifyContextUrl?: string | null;
  paidClickEventName?: string;
  learningClickEventName?: SmartLink["learning_click_event_name"];
  pageBackgroundStyle?: SmartLink["page_background_style"];
  buttonStyle?: SmartLink["button_style"];
  pageStyleOptions?: PageStyleOptions | null;
}): Promise<SmartLink> {
  const id = newId("lnk");
  const slug = assertSlug(input.slug);
  const status = input.status ?? "published";
  const publishedAt = status === "published" ? "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')" : "NULL";
  const styleOptions = serializePageStyleOptions(
    input.pageStyleOptions ? normalizePageStyleOptions(input.pageStyleOptions) : DEFAULT_PAGE_STYLE_OPTIONS
  );
  await env.DB.prepare(
    `INSERT INTO links (
       id, track_id, link_name, slug, mode, status, published_at,
       spotify_open_behavior, spotify_context_url, paid_click_event_name, learning_click_event_name,
       page_background_style, button_style, page_style_options
     )
     VALUES (?, ?, ?, ?, ?, ?, ${publishedAt}, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      input.trackId,
      input.linkName.trim(),
      slug,
      input.mode,
      status,
      input.spotifyOpenBehavior ?? "web",
      emptyToNull(input.spotifyContextUrl),
      input.paidClickEventName?.trim() || "Stream_Click_Paid",
      input.learningClickEventName ?? null,
      input.pageBackgroundStyle ?? DEFAULT_PAGE_BACKGROUND_STYLE,
      input.buttonStyle ?? DEFAULT_BUTTON_STYLE,
      styleOptions
    )
    .run();
  if (input.releaseAt !== undefined) {
    await env.DB.prepare(
      `UPDATE tracks SET release_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
    )
      .bind(input.releaseAt, input.trackId)
      .run();
  }
  await replaceDestinations(env, id, input.destinations);
  const link = await getLinkById(env, id);
  if (!link) throw new Error("Link creation failed.");
  if (link.status === "published") {
    await env.LINK_CACHE.put(cacheKey(link.slug), JSON.stringify(applyEffectiveMode(link)), { expirationTtl: PUBLISHED_LINK_TTL });
  }
  return link;
}

export async function updateLink(env: RuntimeEnv, id: string, input: {
  linkName: string;
  slug: string;
  mode: LinkMode;
  destinations: Partial<Record<Platform, string>>;
  viewEventName?: string;
  clickEventName?: string | null;
  status?: SmartLink["status"];
  releaseAt?: string | null;
  spotifyOpenBehavior?: SmartLink["spotify_open_behavior"];
  spotifyContextUrl?: string | null;
  paidClickEventName?: string;
  learningClickEventName?: SmartLink["learning_click_event_name"];
  pageBackgroundStyle?: SmartLink["page_background_style"];
  buttonStyle?: SmartLink["button_style"];
  pageStyleOptions?: PageStyleOptions | null;
}): Promise<SmartLink> {
  const old = await getLinkById(env, id);
  if (!old) throw new Error("Link not found.");
  const slug = assertSlug(input.slug);

  const sets = ["link_name = ?", "slug = ?", "mode = ?", "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"];
  const bindings: unknown[] = [input.linkName.trim(), slug, input.mode];

  if (input.viewEventName !== undefined) {
    sets.push("view_event_name = ?");
    bindings.push(input.viewEventName);
  }
  if (input.clickEventName !== undefined) {
    sets.push("click_event_name = ?");
    bindings.push(input.clickEventName);
  }
  if (input.status !== undefined) {
    sets.push("status = ?");
    bindings.push(input.status);
  }
  if (input.spotifyOpenBehavior !== undefined) {
    sets.push("spotify_open_behavior = ?");
    bindings.push(input.spotifyOpenBehavior);
  }
  if (input.spotifyContextUrl !== undefined) {
    sets.push("spotify_context_url = ?");
    bindings.push(emptyToNull(input.spotifyContextUrl));
  }
  if (input.paidClickEventName !== undefined) {
    sets.push("paid_click_event_name = ?");
    bindings.push(input.paidClickEventName.trim() || "Stream_Click_Paid");
  }
  if (input.learningClickEventName !== undefined) {
    sets.push("learning_click_event_name = ?");
    bindings.push(input.learningClickEventName);
  }
  if (input.pageBackgroundStyle !== undefined) {
    sets.push("page_background_style = ?");
    bindings.push(input.pageBackgroundStyle);
  }
  if (input.buttonStyle !== undefined) {
    sets.push("button_style = ?");
    bindings.push(input.buttonStyle);
  }
  if (input.pageStyleOptions !== undefined) {
    sets.push("page_style_options = ?");
    bindings.push(
      input.pageStyleOptions == null
        ? serializePageStyleOptions(DEFAULT_PAGE_STYLE_OPTIONS)
        : serializePageStyleOptions(input.pageStyleOptions)
    );
  }

  bindings.push(id);
  await env.DB.prepare(`UPDATE links SET ${sets.join(", ")} WHERE id = ?`).bind(...bindings).run();

  if (input.releaseAt !== undefined) {
    await env.DB.prepare(
      `UPDATE tracks SET release_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
    )
      .bind(input.releaseAt, old.track_id)
      .run();
  }

  await replaceDestinations(env, id, input.destinations);
  await purgeLinkCache(env, old.slug);
  if (slug !== old.slug) await purgeLinkCache(env, slug);
  if (input.status === "archived") await purgeLinkCache(env, slug);

  const link = await getLinkById(env, id);
  if (!link) throw new Error("Link update failed.");
  return link;
}

export async function archiveLink(env: RuntimeEnv, id: string): Promise<SmartLink> {
  const old = await getLinkById(env, id);
  if (!old) throw new Error("Link not found.");
  await env.DB.prepare(
    `UPDATE links SET status = 'archived', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
  )
    .bind(id)
    .run();
  await purgeLinkCache(env, old.slug);
  const link = await getLinkById(env, id);
  if (!link) throw new Error("Link not found.");
  return link;
}

export async function deleteLink(env: RuntimeEnv, id: string): Promise<void> {
  const old = await getLinkById(env, id);
  if (!old) throw new Error("Link not found.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM destinations WHERE link_id = ?").bind(id),
    env.DB.prepare("DELETE FROM subscribers WHERE link_id = ?").bind(id),
    env.DB.prepare("DELETE FROM daily_metrics WHERE link_id = ?").bind(id),
    env.DB.prepare("DELETE FROM metric_events WHERE link_id = ?").bind(id),
    env.DB.prepare("DELETE FROM capi_log WHERE link_id = ?").bind(id),
    env.DB.prepare("DELETE FROM links WHERE id = ?").bind(id)
  ]);
  await purgeLinkCache(env, old.slug);
}

export async function publishLink(env: RuntimeEnv, id: string): Promise<SmartLink> {
  await env.DB.prepare(
    `UPDATE links SET status = 'published', published_at = COALESCE(published_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
  )
    .bind(id)
    .run();
  const link = await getLinkById(env, id);
  if (!link) throw new Error("Link not found.");
  await env.LINK_CACHE.put(cacheKey(link.slug), JSON.stringify(applyEffectiveMode(link)), { expirationTtl: PUBLISHED_LINK_TTL });
  return link;
}

export async function setTrackArtworkObject(env: RuntimeEnv, trackId: string, key: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE tracks SET artwork_object_key = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
  )
    .bind(key, trackId)
    .run();
}

export async function incrementDailyMetric(env: RuntimeEnv, linkId: string, kind: "views" | "clicks" | "presaves", platform = ""): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const column = kind;
  await env.DB.prepare(
    `INSERT INTO daily_metrics (day, link_id, platform, ${column})
     VALUES (?, ?, ?, 1)
     ON CONFLICT(day, link_id, platform) DO UPDATE SET ${column} = ${column} + 1`
  )
    .bind(day, linkId, platform)
    .run();
}

export async function subscribeEmail(env: RuntimeEnv, linkId: string, email: string): Promise<{ created: boolean; id: string }> {
  const normalized = email.trim().toLowerCase();
  const id = newId("sub");
  const result = await env.DB.prepare("INSERT OR IGNORE INTO subscribers (id, link_id, email) VALUES (?, ?, ?)")
    .bind(id, linkId, normalized)
    .run();

  if ((result.meta?.changes ?? 0) > 0) {
    return { created: true, id };
  }

  const existing = await env.DB.prepare("SELECT id FROM subscribers WHERE link_id = ? AND email = ?")
    .bind(linkId, normalized)
    .first<{ id: string }>();
  if (!existing) throw new Error("Subscribe insert failed.");
  return { created: false, id: existing.id };
}

export async function listSubscribers(env: RuntimeEnv, linkId: string): Promise<Array<{ id: string; email: string; consented_at: string }>> {
  const result = await env.DB.prepare(
    "SELECT id, email, consented_at FROM subscribers WHERE link_id = ? ORDER BY consented_at DESC"
  )
    .bind(linkId)
    .all<{ id: string; email: string; consented_at: string }>();
  return result.results ?? [];
}

export async function deleteSubscriber(env: RuntimeEnv, linkId: string, subscriberId: string): Promise<boolean> {
  const result = await env.DB.prepare("DELETE FROM subscribers WHERE id = ? AND link_id = ?")
    .bind(subscriberId, linkId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function purgeLinkCache(env: RuntimeEnv, slug: string): Promise<void> {
  await env.LINK_CACHE.delete(cacheKey(slug));
}

export async function purgeTrackLinkCaches(env: RuntimeEnv, trackId: string): Promise<void> {
  const result = await env.DB.prepare("SELECT slug FROM links WHERE track_id = ? AND status = 'published'")
    .bind(trackId)
    .all<{ slug: string }>();
  await Promise.all((result.results ?? []).map((row) => purgeLinkCache(env, row.slug)));
}

async function hydrateLink(env: RuntimeEnv, row: LinkRow): Promise<SmartLink | null> {
  const track = await getTrackById(env, row.track_id);
  if (!track) return null;
  const destinations = await env.DB.prepare("SELECT * FROM destinations WHERE link_id = ? ORDER BY sort_order ASC")
    .bind(row.id)
    .all<Destination>();

  return {
    id: row.id,
    track_id: row.track_id,
    link_name: row.link_name,
    slug: row.slug,
    mode: row.mode,
    status: row.status,
    view_event_name: row.view_event_name || "ViewContent",
    click_event_name: row.click_event_name ?? null,
    paid_click_event_name: row.paid_click_event_name || "Stream_Click_Paid",
    learning_click_event_name: row.learning_click_event_name ?? null,
    spotify_open_behavior: defaultSpotifyOpenBehavior(row.spotify_open_behavior),
    spotify_context_url: row.spotify_context_url || null,
    page_background_style: normalizePageBackgroundStyle(row.page_background_style),
    button_style: normalizeButtonStyle(row.button_style),
    page_style_options: parsePageStyleOptionsJson(row.page_style_options),
    created_at: row.created_at,
    updated_at: row.updated_at,
    published_at: row.published_at,
    track,
    destinations: (destinations.results ?? []) as Destination[]
  };
}

async function getTrackById(env: RuntimeEnv, id: string): Promise<Track | null> {
  const row = await env.DB.prepare(
    `SELECT tracks.*, COALESCE(artists.name, '') AS artist_name
     FROM tracks LEFT JOIN artists ON artists.id = tracks.artist_id
     WHERE tracks.id = ?`
  )
    .bind(id)
    .first<Track>();
  if (!row) return null;
  const artistRows = await env.DB.prepare(
    `SELECT artists.name
     FROM track_artists JOIN artists ON artists.id = track_artists.artist_id
     WHERE track_artists.track_id = ?
     ORDER BY track_artists.sort_order ASC`
  )
    .bind(id)
    .all<{ name: string }>();
  const artistNames = (artistRows.results ?? []).map((artist) => artist.name);
  row.artist_names = artistNames.length > 0 ? artistNames : row.artist_name ? [row.artist_name] : [];
  row.artist_name = row.artist_names.join(", ");
  return row;
}

async function getOrCreateArtist(env: RuntimeEnv, name: string): Promise<{ id: string; name: string }> {
  const normalized = name.trim();
  const existing = await env.DB.prepare("SELECT id, name FROM artists WHERE lower(name) = lower(?)")
    .bind(normalized)
    .first<{ id: string; name: string }>();
  if (existing) return existing;
  const id = newId("art");
  await env.DB.prepare("INSERT INTO artists (id, name) VALUES (?, ?)").bind(id, normalized).run();
  return { id, name: normalized };
}

async function findExistingTrack(env: RuntimeEnv, input: { trackId?: string; isrc: string | null; sourceUrl: string }): Promise<Track | null> {
  if (input.trackId) {
    const track = await getTrackById(env, input.trackId);
    if (track) return track;
  }
  if (input.isrc) {
    const row = await env.DB.prepare("SELECT id FROM tracks WHERE isrc = ?").bind(input.isrc).first<{ id: string }>();
    if (row) return getTrackById(env, row.id);
  }
  const row = await env.DB.prepare("SELECT id FROM tracks WHERE source_url = ? AND isrc IS NULL ORDER BY updated_at DESC LIMIT 1")
    .bind(input.sourceUrl)
    .first<{ id: string }>();
  return row ? getTrackById(env, row.id) : null;
}

async function replaceTrackArtists(env: RuntimeEnv, trackId: string, artists: Array<{ id: string; name: string }>): Promise<void> {
  await env.DB.prepare("DELETE FROM track_artists WHERE track_id = ?").bind(trackId).run();
  let index = 0;
  for (const artist of artists) {
    await env.DB.prepare("INSERT OR REPLACE INTO track_artists (track_id, artist_id, sort_order) VALUES (?, ?, ?)")
      .bind(trackId, artist.id, index)
      .run();
    index += 1;
  }
}

function normalizedArtistNames(imported: ImportedTrack): string[] {
  const raw = imported.artistNames?.length ? imported.artistNames : splitArtistNames(imported.artistName ?? "");
  return Array.from(new Set(raw.map((name) => name.trim()).filter(Boolean)));
}

function splitArtistNames(value: string): string[] {
  return value
    .split(/\s*,\s*|\s+\+\s+|\s+&\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function replaceDestinations(env: RuntimeEnv, linkId: string, destinations: Partial<Record<Platform, string>>): Promise<void> {
  await env.DB.prepare("DELETE FROM destinations WHERE link_id = ?").bind(linkId).run();
  const entries = Object.entries(destinations).filter((entry): entry is [Platform, string] => Boolean(entry[1]?.trim()));
  let index = 0;
  for (const [platform, url] of entries) {
    await env.DB.prepare(
      `INSERT INTO destinations (id, link_id, platform, label, url, sort_order, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(newId("dst"), linkId, platform, platformLabels[platform] ?? platform, url.trim(), index, index === 0 ? 1 : 0)
      .run();
    index += 1;
  }
}

function cacheKey(slug: string): string {
  return `link:${slug}`;
}
