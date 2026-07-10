import { z } from "zod";
import type { ImportedTrack, Platform } from "@lib/types";
import { safeFetchResponse } from "@lib/safe-fetch";
import { USER_AGENT } from "@lib/brand";

const odesliEntitySchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string().optional(),
  artistName: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  apiProvider: z.string().optional()
});

const odesliLinkSchema = z.object({
  url: z.string(),
  entityUniqueId: z.string().optional()
});

export const odesliResponseSchema = z.object({
  entityUniqueId: z.string().optional(),
  entitiesByUniqueId: z.record(z.string(), odesliEntitySchema).optional(),
  linksByPlatform: z.record(z.string(), odesliLinkSchema).optional()
});

// Odesli also returns anghami, boomplay, napster, pandora, yandex, etc.
// Linkbeam only maps the storefronts shown on fan smartlinks; the rest stay manual/other.
const odesliPlatformMap: Record<string, Platform> = {
  spotify: "spotify",
  appleMusic: "apple",
  itunes: "apple",
  youtube: "youtube",
  youtubeMusic: "youtube",
  soundcloud: "soundcloud",
  bandcamp: "bandcamp",
  deezer: "deezer",
  tidal: "tidal",
  amazonMusic: "amazon",
  amazonStore: "amazon"
};

const odesliPlatformPriority: Record<Platform, string[]> = {
  spotify: ["spotify"],
  apple: ["appleMusic", "itunes"],
  youtube: ["youtubeMusic", "youtube"],
  soundcloud: ["soundcloud"],
  bandcamp: ["bandcamp"],
  deezer: ["deezer"],
  tidal: ["tidal"],
  amazon: ["amazonMusic", "amazonStore"],
  other: []
};

export function mapOdesliDestinations(linksByPlatform: Record<string, { url: string }>): Partial<Record<Platform, string>> {
  const destinations: Partial<Record<Platform, string>> = {};
  for (const [platform, keys] of Object.entries(odesliPlatformPriority) as Array<[Platform, string[]]>) {
    for (const key of keys) {
      const link = linksByPlatform[key];
      if (link?.url) {
        destinations[platform] = link.url;
        break;
      }
    }
  }
  return destinations;
}

export function parseOdesliResponse(data: unknown, sourceUrl: string): ImportedTrack {
  const parsed = odesliResponseSchema.parse(data);
  const entities = parsed.entitiesByUniqueId ?? {};
  const linksByPlatform = parsed.linksByPlatform ?? {};
  const entity = parsed.entityUniqueId ? entities[parsed.entityUniqueId] : undefined;
  const fallbackEntity = entity ?? Object.values(entities).find((item) => item.type === "song");

  return {
    provider: "odesli",
    sourceUrl,
    title: fallbackEntity?.title,
    artistName: fallbackEntity?.artistName,
    artistNames: fallbackEntity?.artistName ? [fallbackEntity.artistName] : undefined,
    artworkUrl: fallbackEntity?.thumbnailUrl,
    destinations: mapOdesliDestinations(linksByPlatform)
  };
}

export async function importOdesli(sourceUrl: string): Promise<ImportedTrack> {
  const response = await safeFetchResponse(
    `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(sourceUrl)}`,
    {
      maxBytes: 2_000_000,
      timeoutMs: 8_000,
      allowedHosts: ["api.song.link"],
      init: { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }
    }
  );
  if (!response.ok) throw new Error(`Odesli lookup failed (${response.status}).`);
  return parseOdesliResponse(await response.json(), sourceUrl);
}

export function odesliPlatformKey(platform: string): Platform | undefined {
  return odesliPlatformMap[platform];
}
