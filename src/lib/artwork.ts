import type { RuntimeEnv } from "@lib/runtime";
import type { ImportedTrack, Track } from "@lib/types";

export function artworkPublicPath(track: Track): string {
  if (track.artwork_object_key) return `/artwork/${encodeURIComponent(track.id)}`;
  return track.artwork_url ?? "/placeholder-artwork.svg";
}

export function canCacheArtwork(imported: ImportedTrack): boolean {
  if (!imported.artworkUrl) return false;
  return ["toolost", "spotify", "apple", "odesli", "deezer", "isrc"].includes(imported.provider);
}

export async function cacheArtwork(env: RuntimeEnv, imported: ImportedTrack, track: Track): Promise<string | null> {
  if (!canCacheArtwork(imported) || !imported.artworkUrl) return null;
  const response = await fetch(imported.artworkUrl);
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return null;
  const extension = extensionForContentType(contentType);
  const key = `artwork/${track.isrc ?? track.id}.${extension}`;
  await env.ARTWORK.put(key, response.body, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable"
    },
    customMetadata: {
      source: imported.sourceUrl,
      provider: imported.provider
    }
  });
  return key;
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}
