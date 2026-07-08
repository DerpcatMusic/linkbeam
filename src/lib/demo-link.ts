import { createLink, getLinkBySlug, getPublishedLink, publishLink, upsertTrackFromImport } from "@lib/db";
import { backfillDestinations } from "@lib/platforms/backfill";
import { importOdesli } from "@lib/platforms/odesli";
import type { ImportedTrack, Platform, SmartLink } from "@lib/types";
import type { RuntimeEnv } from "@lib/runtime";

export const DEMO_SOURCE_URL = "https://open.spotify.com/track/6C9CWSj6BqlZoHZBaCZSSq";
export const DEMO_SLUG = "demon-cake";

const DESTINATION_ORDER: Platform[] = ["spotify", "apple", "youtube", "amazon", "deezer", "tidal", "soundcloud", "bandcamp"];

export async function ensureDemoSmartLink(env: RuntimeEnv): Promise<SmartLink> {
  const published = await getPublishedLink(env, DEMO_SLUG);
  if (published) return published;

  const existing = await getLinkBySlug(env, DEMO_SLUG, false);
  if (existing) {
    if (existing.status === "published") return existing;
    return publishLink(env, existing.id);
  }

  const imported = await demoImport();
  const destinations = orderedDestinations(imported.destinations);
  if (Object.keys(destinations).length === 0) {
    throw new Error("Demo Odesli lookup returned no streaming destinations.");
  }

  const track = await upsertTrackFromImport(env, imported);
  const artist = imported.artistName ?? imported.artistNames?.join(", ") ?? track.artist_name;
  const linkName = artist ? `${track.title} - ${artist}` : track.title;

  try {
    return await createLink(env, {
      linkName,
      slug: DEMO_SLUG,
      trackId: track.id,
      mode: "live",
      status: "published",
      destinations,
      spotifyOpenBehavior: "web"
    });
  } catch (error) {
    const raced = await getPublishedLink(env, DEMO_SLUG);
    if (raced) return raced;
    throw error;
  }
}

async function demoImport(): Promise<ImportedTrack> {
  try {
    return await backfillDestinations(await importOdesli(DEMO_SOURCE_URL));
  } catch {
    return DEMO_FALLBACK;
  }
}

function orderedDestinations(destinations: Partial<Record<Platform, string>>): Partial<Record<Platform, string>> {
  const ordered: Partial<Record<Platform, string>> = {};
  for (const platform of DESTINATION_ORDER) {
    if (destinations[platform]) ordered[platform] = destinations[platform];
  }
  return ordered;
}

const DEMO_FALLBACK: ImportedTrack = {
  provider: "demo",
  sourceUrl: DEMO_SOURCE_URL,
  title: "Demon Cake",
  artistName: "Derpcat, PVTHOS",
  artistNames: ["Derpcat", "PVTHOS"],
  artworkUrl: "https://i.scdn.co/image/ab67616d0000b273860b5181544d4e7f2f51287a",
  destinations: {
    spotify: DEMO_SOURCE_URL,
    youtube: "https://music.youtube.com/search?q=Derpcat%2C%20PVTHOS%20Demon%20Cake",
    amazon: "https://music.amazon.com/albums/B0F234R36M?trackAsin=B0F233BPNF",
    deezer: "https://www.deezer.com/track/3328875301",
    tidal: "https://listen.tidal.com/track/425300461"
  }
};
