import type { ImportedTrack } from "@lib/types";
import { searchAppleMusic } from "./apple";

function artistLabel(track: ImportedTrack): string | undefined {
  return track.artistName ?? track.artistNames?.join(", ");
}

// Odesli's free API no longer returns Apple Music or YouTube for most tracks,
// so fill those destinations from the resolved title + artist.
export async function backfillDestinations(track: ImportedTrack): Promise<ImportedTrack> {
  const artist = artistLabel(track);
  if (!track.title || !artist) return track;

  const destinations = { ...track.destinations };
  const term = `${artist} ${track.title}`.trim();

  if (!destinations.apple) {
    try {
      const apple = await searchAppleMusic(track.title, artist);
      if (apple) destinations.apple = apple;
    } catch {
      // Leave Apple unset rather than failing the whole import.
    }
  }

  if (!destinations.youtube) {
    destinations.youtube = `https://music.youtube.com/search?q=${encodeURIComponent(term)}`;
  }

  return { ...track, destinations };
}
