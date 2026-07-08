import type { ImportedTrack } from "@lib/types";
import { metaContent, parseArtistTitle } from "./shared";

export async function importOpenGraph(sourceUrl: string): Promise<ImportedTrack> {
  const response = await fetch(sourceUrl, { headers: { "user-agent": "beamlink/0.1" } });
  if (!response.ok) return { provider: "open_graph", sourceUrl, destinations: { other: sourceUrl } };
  const html = await response.text();
  const title = metaContent(html, "og:title") ?? undefined;
  const parsed = parseArtistTitle(title);

  const artistName = metaContent(html, "music:musician") ?? parsed.artist ?? undefined;
  return {
    provider: "open_graph",
    sourceUrl,
    title: parsed.title ?? title,
    artistName,
    artistNames: artistName ? [artistName] : undefined,
    artworkUrl: metaContent(html, "og:image") ?? undefined,
    destinations: { other: sourceUrl }
  };
}
