import type { ImportedTrack } from "@lib/types";
import { searchAppleMusic } from "./apple";
import { isYouTubeSearchUrl, searchYouTubeMusic, youtubeSearchFallbackUrl } from "./youtube";

function artistLabel(track: ImportedTrack): string | undefined {
  return track.artistName ?? track.artistNames?.join(", ");
}

// Odesli's free API no longer returns Apple Music, YouTube, SoundCloud, or Bandcamp for
// most major-label tracks. Apple and YouTube are backfilled from public search endpoints.
// SoundCloud/Bandcamp have no stable unauthenticated search API — add those manually.
export async function backfillDestinations(track: ImportedTrack): Promise<ImportedTrack> {
  const artist = artistLabel(track);
  if (!track.title || !artist) return track;

  const destinations = { ...track.destinations };

  if (!destinations.apple) {
    try {
      const apple = await searchAppleMusic(track.title, artist);
      if (apple) destinations.apple = apple;
    } catch {
      // Leave Apple unset rather than failing the whole import.
    }
  }

  if (!destinations.youtube || isYouTubeSearchUrl(destinations.youtube)) {
    try {
      const youtube = await searchYouTubeMusic(track.title, artist);
      if (youtube) {
        destinations.youtube = youtube;
      } else if (!destinations.youtube) {
        destinations.youtube = youtubeSearchFallbackUrl(track.title, artist);
      }
    } catch {
      if (!destinations.youtube) {
        destinations.youtube = youtubeSearchFallbackUrl(track.title, artist);
      }
    }
  }

  return { ...track, destinations };
}
