import { z } from "zod";
import type { ImportedTrack } from "@lib/types";
import { safeFetchResponse } from "@lib/safe-fetch";
import { normalizeTrackText } from "./shared";

const appleSearchSchema = z.object({
  results: z.array(
    z.object({
      trackName: z.string().optional(),
      artistName: z.string().optional(),
      artworkUrl100: z.string().optional(),
      trackViewUrl: z.string().optional(),
      releaseDate: z.string().optional()
    })
  )
});

export function isAppleUrl(url: URL): boolean {
  return url.hostname.includes("music.apple.com") || url.hostname.includes("itunes.apple.com");
}

export async function importApple(sourceUrl: string): Promise<ImportedTrack> {
  const id = appleIdFromUrl(sourceUrl);
  if (!id) return { provider: "apple", sourceUrl, destinations: { apple: sourceUrl } };

  const response = await safeFetchResponse(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song`, {
    maxBytes: 2_000_000, timeoutMs: 8_000, allowedHosts: ["itunes.apple.com"]
  });
  if (!response.ok) return { provider: "apple", sourceUrl, destinations: { apple: sourceUrl } };
  const data = appleSearchSchema.parse(await response.json());
  const song = data.results.find((result) => result.trackName) ?? data.results[0];

  return {
    provider: "apple",
    sourceUrl,
    title: song?.trackName,
    artistName: song?.artistName,
    artistNames: song?.artistName ? [song.artistName] : undefined,
    artworkUrl: song?.artworkUrl100?.replace("100x100bb", "1200x1200bb"),
    releaseAt: song?.releaseDate,
    liveAt: song?.releaseDate,
    destinations: { apple: song?.trackViewUrl ?? sourceUrl }
  };
}

// Odesli often omits Apple Music, so resolve a real track link from metadata.
// iTunes search is fuzzy, so only accept a result whose title actually matches:
// a wrong Apple link is worse than none on a smartlink.
export async function searchAppleMusic(title: string, artist: string): Promise<string | undefined> {
  const primaryArtist = artist.split(/[,&]| feat| ft/i)[0].trim();
  const term = `${primaryArtist} ${title}`.trim();
  if (!term) return undefined;

  const response = await safeFetchResponse(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8`,
    { maxBytes: 2_000_000, timeoutMs: 8_000, allowedHosts: ["itunes.apple.com"] }
  );
  if (!response.ok) return undefined;

  const data = appleSearchSchema.parse(await response.json());
  const wantTitle = normalizeTrackText(title);
  const wantArtist = normalizeTrackText(primaryArtist);

  const match = data.results.find((result) => {
    if (!result.trackViewUrl || !result.trackName) return false;
    const gotTitle = normalizeTrackText(result.trackName);
    const gotArtist = normalizeTrackText(result.artistName ?? "");
    const titleMatches = gotTitle === wantTitle || gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle);
    const artistMatches = !wantArtist || gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist);
    return titleMatches && artistMatches;
  });

  return match?.trackViewUrl;
}

function appleIdFromUrl(sourceUrl: string): string | null {
  const url = new URL(sourceUrl);
  const param = url.searchParams.get("i");
  if (param) return param;
  const match = url.pathname.match(/\/(\d+)(?:$|[/?])/);
  return match?.[1] ?? null;
}
