import type { APIRoute } from "astro";
import { importOdesli } from "@lib/platforms/odesli";
import { backfillDestinations } from "@lib/platforms/backfill";
import { badRequest, json } from "@lib/http";
import { platformLabels, type Platform } from "@lib/types";

const ALLOWED_HOSTS =
  /(^|\.)(spotify\.com|music\.apple\.com|itunes\.apple\.com|music\.youtube\.com|youtube\.com|youtu\.be|deezer\.com|tidal\.com)$/i;

const DISPLAY_ORDER: Platform[] = [
  "spotify",
  "apple",
  "youtube",
  "amazon",
  "deezer",
  "tidal",
  "soundcloud",
  "bandcamp"
];

// Public demo resolver: turns one music URL into working destination links.
// No auth, no DB writes; used by the marketing page's live example.
export const GET: APIRoute = async ({ url }) => {
  const target = url.searchParams.get("url")?.trim();
  if (!target) return badRequest("Add a ?url= music link.");

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return badRequest("That doesn't look like a link.");
  }
  if (!ALLOWED_HOSTS.test(parsed.hostname)) {
    return badRequest("Paste a Spotify, Apple Music, or YouTube link.");
  }

  try {
    const imported = await importOdesli(parsed.toString());
    const filled = await backfillDestinations(imported);
    const destinations = DISPLAY_ORDER.filter((platform) => filled.destinations[platform]).map(
      (platform) => ({
        platform,
        label: platformLabels[platform],
        url: filled.destinations[platform] as string
      })
    );

    if (!destinations.length) return badRequest("Couldn't find any streaming links for that one.");

    return json(
      {
        title: filled.title ?? "Your release",
        artist: filled.artistName ?? filled.artistNames?.join(", ") ?? "",
        artwork: filled.artworkUrl ?? null,
        destinations
      },
      { headers: { "Cache-Control": "public, max-age=600" } }
    );
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Couldn't resolve that link.");
  }
};
