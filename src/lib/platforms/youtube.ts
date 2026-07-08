import { z } from "zod";
import type { ImportedTrack } from "@lib/types";
import { parseArtistTitle } from "./shared";

const youtubeOembedSchema = z.object({
  title: z.string().optional(),
  author_name: z.string().optional(),
  thumbnail_url: z.string().optional()
});

export function isYouTubeUrl(url: URL): boolean {
  return url.hostname.includes("youtube.com") || url.hostname === "youtu.be" || url.hostname.includes("music.youtube.com");
}

export async function importYouTube(sourceUrl: string): Promise<ImportedTrack> {
  const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(sourceUrl)}`);
  if (!response.ok) return { provider: "youtube", sourceUrl, destinations: { youtube: sourceUrl } };

  const data = youtubeOembedSchema.parse(await response.json());
  const parsed = parseArtistTitle(data.title);

  return {
    provider: "youtube",
    sourceUrl,
    title: parsed.title ?? data.title,
    artistName: parsed.artist ?? data.author_name,
    artistNames: parsed.artist ? [parsed.artist] : data.author_name ? [data.author_name] : undefined,
    artworkUrl: data.thumbnail_url,
    destinations: { youtube: sourceUrl }
  };
}
