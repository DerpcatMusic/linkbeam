import { z } from "zod";
import type { ImportedTrack } from "@lib/types";
import { safeFetchResponse } from "@lib/safe-fetch";
import { normalizeIsrc } from "@lib/id";
import { mergeImported } from "./shared";
import { importOdesli } from "./odesli";

const deezerTrackSchema = z.object({
  id: z.number(),
  title: z.string(),
  isrc: z.string().optional(),
  link: z.string(),
  release_date: z.string().optional(),
  artist: z.object({ name: z.string() }).optional(),
  album: z.object({ cover_big: z.string().optional() }).optional(),
  error: z.object({ message: z.string() }).optional()
});

export async function importFromIsrc(input: string): Promise<ImportedTrack> {
  const isrc = normalizeIsrc(input);
  const response = await safeFetchResponse(`https://api.deezer.com/track/isrc:${isrc}`, {
    maxBytes: 2_000_000, timeoutMs: 8_000, allowedHosts: ["api.deezer.com"]
  });
  const data = deezerTrackSchema.parse(await response.json());
  if (data.error) throw new Error(data.error.message || "ISRC not found on Deezer.");

  const deezerUrl = data.link;
  const odesli = await importOdesli(deezerUrl);

  const deezerImported: ImportedTrack = {
    provider: "isrc",
    sourceUrl: `isrc:${isrc}`,
    isrc,
    title: data.title,
    artistName: data.artist?.name,
    artistNames: data.artist?.name ? [data.artist.name] : undefined,
    artworkUrl: data.album?.cover_big,
    releaseAt: data.release_date,
    destinations: { deezer: deezerUrl }
  };

  return mergeImported(deezerImported, odesli);
}
