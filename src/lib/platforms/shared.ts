import type { ImportedTrack } from "@lib/types";

export function pickLargestImage(images: Array<{ url: string; width?: number | null }>): { url: string } | undefined {
  return [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
}

export function parseArtistTitle(input?: string): { title?: string; artist?: string } {
  if (!input) return {};
  const cleaned = input.replace(/\s*\|\s*Spotify\s*$/i, "").trim();

  const spotifySplit = cleaned.split(" - song and lyrics by ");
  if (spotifySplit.length === 2) return { title: spotifySplit[0], artist: spotifySplit[1] };

  const commonSplit = cleaned.split(" - ");
  if (commonSplit.length >= 2) {
    const [artist, ...titleParts] = commonSplit;
    return { artist: artist.trim(), title: titleParts.join(" - ").trim() };
  }

  return { title: cleaned };
}

export function metaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return html.match(regex)?.[1] ?? null;
}

export function parseNextData<T>(html: string): T | null {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

export function pickLargestEmbedImage(
  images: Array<{ url: string; maxWidth?: number | null; maxHeight?: number | null }>
): { url: string } | undefined {
  return [...images].sort((a, b) => (b.maxWidth ?? b.maxHeight ?? 0) - (a.maxWidth ?? a.maxHeight ?? 0))[0];
}

export function normalizeTrackText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Direct storefront links beat search-page fallbacks when merging imports. */
export function destinationQuality(url: string): number {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.includes("/search")) return 0;
  } catch {
    return 0;
  }
  return 1;
}

export function mergeDestinations(
  ...parts: Array<Partial<Record<string, string>>>
): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (!value) continue;
      const existing = out[key];
      if (!existing || destinationQuality(value) >= destinationQuality(existing)) {
        out[key] = value;
      }
    }
  }
  return out;
}

export function mergeImported(primary: ImportedTrack, secondary: ImportedTrack): ImportedTrack {
  return {
    ...secondary,
    ...primary,
    provider: primary.provider,
    sourceUrl: primary.sourceUrl,
    isrc: primary.isrc ?? secondary.isrc,
    title: primary.title ?? secondary.title,
    artistName: primary.artistName ?? secondary.artistName,
    artistNames: primary.artistNames ?? secondary.artistNames,
    artworkUrl: primary.artworkUrl ?? secondary.artworkUrl,
    releaseAt: primary.releaseAt ?? secondary.releaseAt,
    liveAt: primary.liveAt ?? secondary.liveAt,
    palette: primary.palette ?? secondary.palette,
    destinations: mergeDestinations(secondary.destinations, primary.destinations)
  };
}
