import type { ImportedTrack } from "@lib/types";
import { safeFetchText } from "@lib/safe-fetch";
import { USER_AGENT } from "@lib/brand";
import { metaContent, parseArtistTitle } from "./shared";

export async function importOpenGraph(sourceUrl: string): Promise<ImportedTrack> {
  const { response, text: html } = await safeFetchText(sourceUrl, {
    maxBytes: 2_000_000,
    timeoutMs: 8_000,
    init: { headers: { "user-agent": USER_AGENT } }
  });
  if (!response.ok) return { provider: "open_graph", sourceUrl, destinations: { other: sourceUrl } };
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
