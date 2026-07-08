import type { ImportedTrack, Platform } from "@lib/types";

export async function importTooLostTrack(input: {
  sourceUrl: string;
  isrc: string;
  title: string;
  artistName: string;
  artistNames?: string[];
  artworkUrl?: string;
  releaseAt?: string;
  destinations?: Partial<Record<Platform, string>>;
}): Promise<ImportedTrack> {
  return {
    provider: "toolost",
    sourceUrl: input.sourceUrl,
    isrc: input.isrc,
    title: input.title,
    artistName: input.artistName,
    artistNames: input.artistNames,
    artworkUrl: input.artworkUrl,
    releaseAt: input.releaseAt,
    destinations: input.destinations ?? {}
  };
}
