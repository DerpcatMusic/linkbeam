import type { ImportedTrack } from "@lib/types";
import type { RuntimeEnv } from "@lib/runtime";
import { isBareIsrc } from "@lib/id";
import { importApple, isAppleUrl } from "./apple";
import { backfillDestinations } from "./backfill";
import { importFromIsrc } from "./isrc";
import { importOdesli } from "./odesli";
import { importOpenGraph } from "./open-graph";
import { mergeImported } from "./shared";
import { importSpotify, isSpotifyUrl } from "./spotify";
import { importYouTube, isYouTubeUrl } from "./youtube";
export { importTooLostTrack } from "./toolost";

export async function importTrackFromUrl(env: RuntimeEnv, sourceUrl: string): Promise<ImportedTrack> {
  const url = new URL(sourceUrl);
  if (isSpotifyUrl(url)) return importSpotify(env, sourceUrl);
  if (isAppleUrl(url)) return importApple(sourceUrl);
  if (isYouTubeUrl(url)) return importYouTube(sourceUrl);
  return importOpenGraph(sourceUrl);
}

export async function importTrackFromInput(env: RuntimeEnv, input: string): Promise<ImportedTrack> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Import input is required.");

  if (isBareIsrc(trimmed)) return importFromIsrc(trimmed);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Import input must be a URL or ISRC.");
  }

  const imported = await importTrackFromUrl(env, url.toString());
  let resolved = imported;
  try {
    const odesli = await importOdesli(url.toString());
    resolved = mergeImported(imported, odesli);
  } catch {
    // Keep the primary import if Odesli is unavailable.
  }
  return backfillDestinations(resolved);
}
