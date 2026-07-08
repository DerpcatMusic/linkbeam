import { z } from "zod";
import type { ImportedTrack } from "@lib/types";
import { normalizeTrackText, parseArtistTitle } from "./shared";

const YT_MUSIC_SONGS_FILTER = "EgWKAQIIAWoKEAkQAxAFEAoQBA";

interface YouTubeMusicSearchItem {
  title?: string;
  artist?: string;
  videoId?: string;
}

const youtubeOembedSchema = z.object({
  title: z.string().optional(),
  author_name: z.string().optional(),
  thumbnail_url: z.string().optional()
});

export function isYouTubeUrl(url: URL): boolean {
  return url.hostname.includes("youtube.com") || url.hostname === "youtu.be" || url.hostname.includes("music.youtube.com");
}

export function isYouTubeSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("youtube.com") && parsed.pathname.includes("/search");
  } catch {
    return false;
  }
}

export function youtubeSearchFallbackUrl(title: string, artist: string): string {
  const term = `${artist} ${title}`.trim();
  return `https://music.youtube.com/search?q=${encodeURIComponent(term)}`;
}

function readTextRuns(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const runs = (node as { runs?: Array<{ text?: string }> }).runs;
  return runs?.map((run) => run.text ?? "").join("") ?? "";
}

function watchEndpointFromItem(item: Record<string, unknown>): { videoId?: string } | undefined {
  const nav = item.navigationEndpoint as { watchEndpoint?: { videoId?: string } } | undefined;
  if (nav?.watchEndpoint?.videoId) return nav.watchEndpoint;

  const overlay = item.overlay as
    | {
        musicItemThumbnailOverlayRenderer?: {
          content?: {
            musicPlayButtonRenderer?: {
              playNavigationEndpoint?: { watchEndpoint?: { videoId?: string } };
            };
          };
        };
      }
    | undefined;
  return overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
    ?.watchEndpoint;
}

export function parseYouTubeMusicSearch(data: unknown): YouTubeMusicSearchItem[] {
  const root = data as {
    contents?: {
      tabbedSearchResultsRenderer?: {
        tabs?: Array<{
          tabRenderer?: {
            content?: {
              sectionListRenderer?: {
                contents?: Array<{
                  musicShelfRenderer?: {
                    contents?: Array<{
                      musicResponsiveListItemRenderer?: Record<string, unknown>;
                    }>;
                  };
                }>;
              };
            };
          };
        }>;
      };
    };
  };

  const sections =
    root.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ??
    [];
  const items: YouTubeMusicSearchItem[] = [];

  for (const section of sections) {
    for (const entry of section.musicShelfRenderer?.contents ?? []) {
      const renderer = entry.musicResponsiveListItemRenderer;
      if (!renderer) continue;
      const columns = (renderer.flexColumns as Array<{ musicResponsiveListItemFlexColumnRenderer?: { text?: unknown } }>) ?? [];
      const title = readTextRuns(columns[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
      const artist = readTextRuns(columns[1]?.musicResponsiveListItemFlexColumnRenderer?.text).split("•")[0]?.trim();
      const videoId = watchEndpointFromItem(renderer)?.videoId;
      if (title || videoId) items.push({ title, artist, videoId });
    }
  }

  return items;
}

// Odesli no longer returns YouTube for most tracks; resolve a watch link via YouTube Music search.
export async function searchYouTubeMusic(title: string, artist: string): Promise<string | undefined> {
  const primaryArtist = artist.split(/[,&]| feat| ft/i)[0].trim();
  const term = `${primaryArtist} ${title}`.trim();
  if (!term) return undefined;

  const response = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "WEB_REMIX",
          clientVersion: "1.20240401.00.00",
          hl: "en"
        }
      },
      query: term,
      params: YT_MUSIC_SONGS_FILTER
    })
  });
  if (!response.ok) return undefined;

  const wantTitle = normalizeTrackText(title);
  const wantArtist = normalizeTrackText(primaryArtist);
  const match = parseYouTubeMusicSearch(await response.json()).find((result) => {
    if (!result.videoId || !result.title) return false;
    const gotTitle = normalizeTrackText(result.title);
    const gotArtist = normalizeTrackText(result.artist ?? "");
    const titleMatches = gotTitle === wantTitle || gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle);
    const artistMatches = !wantArtist || gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist);
    return titleMatches && artistMatches;
  });

  return match?.videoId ? `https://music.youtube.com/watch?v=${match.videoId}` : undefined;
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
