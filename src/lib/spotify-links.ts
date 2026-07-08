import type { Destination, SmartLink, SpotifyOpenBehavior } from "@lib/types";

export type SpotifyResourceType = "track" | "album" | "playlist" | "artist";

export interface SpotifyResource {
  type: SpotifyResourceType;
  id: string;
}

const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{10,}$/;
const SPOTIFY_RESOURCE_TYPES = new Set<SpotifyResourceType>(["track", "album", "playlist", "artist"]);

export function parseSpotifyResource(input: string | null | undefined): SpotifyResource | null {
  const value = input?.trim();
  if (!value) return null;

  const uriMatch = value.match(/^spotify:(track|album|playlist|artist):([A-Za-z0-9]+)$/i);
  if (uriMatch) return resource(uriMatch[1], uriMatch[2]);

  const appMatch = value.match(/^spotify:\/\/(track|album|playlist|artist)\/([A-Za-z0-9]+)/i);
  if (appMatch) return resource(appMatch[1], appMatch[2]);

  try {
    const url = new URL(value);
    if (!/(^|\.)spotify\.com$/i.test(url.hostname)) return null;
    const [type, id] = url.pathname.split("/").filter(Boolean);
    return resource(type, id);
  } catch {
    return null;
  }
}

export function spotifyWebUrlWithContext(destinationUrl: string, contextUrl?: string | null): string {
  const track = parseSpotifyResource(destinationUrl);
  const playlist = parseSpotifyResource(contextUrl);
  if (track?.type !== "track" || playlist?.type !== "playlist") return destinationUrl;

  const webUrl = spotifyWebUrl(track);
  webUrl.search = searchParamsFrom(destinationUrl).toString();
  webUrl.searchParams.set("context", `spotify:playlist:${playlist.id}`);
  return webUrl.toString();
}

export function spotifyAppUri(destinationUrl: string, contextUrl?: string | null): string | null {
  const destination = parseSpotifyResource(destinationUrl);
  if (!destination) return null;

  const playlist = parseSpotifyResource(contextUrl);
  if (destination.type === "track" && playlist?.type === "playlist") {
    const params = new URLSearchParams({ context: `spotify:playlist:${playlist.id}` });
    return `spotify://track/${destination.id}?${params.toString()}`;
  }

  return `spotify:${destination.type}:${destination.id}`;
}

export function spotifyDestinationUrl(link: SmartLink, destination: Destination): string {
  if (destination.platform !== "spotify") return destination.url;
  if (link.spotify_open_behavior === "playlist_context" || link.spotify_open_behavior === "app_first") {
    return spotifyWebUrlWithContext(destination.url, link.spotify_context_url);
  }
  return normalizedSpotifyWebUrl(destination.url);
}

export function defaultSpotifyOpenBehavior(value: string | null | undefined): SpotifyOpenBehavior {
  return value === "playlist_context" || value === "app_first" ? value : "web";
}

function resource(type: string | undefined, id: string | undefined): SpotifyResource | null {
  const normalizedType = type?.toLowerCase() as SpotifyResourceType | undefined;
  if (!normalizedType || !SPOTIFY_RESOURCE_TYPES.has(normalizedType) || !id || !SPOTIFY_ID_PATTERN.test(id)) return null;
  return { type: normalizedType, id };
}

function spotifyWebUrl(resource: SpotifyResource): URL {
  return new URL(`https://open.spotify.com/${resource.type}/${resource.id}`);
}

function normalizedSpotifyWebUrl(destinationUrl: string): string {
  const spotifyResource = parseSpotifyResource(destinationUrl);
  if (!spotifyResource) return destinationUrl;
  const webUrl = spotifyWebUrl(spotifyResource);
  webUrl.search = searchParamsFrom(destinationUrl).toString();
  return webUrl.toString();
}

function searchParamsFrom(value: string): URLSearchParams {
  try {
    return new URL(value).searchParams;
  } catch {
    return new URLSearchParams();
  }
}
