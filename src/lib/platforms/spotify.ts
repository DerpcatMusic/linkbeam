import { z } from "zod";
import type { ImportedTrack, TrackPalette } from "@lib/types";
import type { RuntimeEnv } from "@lib/runtime";
import { safeFetchResponse } from "@lib/safe-fetch";
import { parseNextData, pickLargestEmbedImage, pickLargestImage } from "./shared";

const rgbaColorSchema = z.object({
  alpha: z.number(),
  red: z.number(),
  green: z.number(),
  blue: z.number()
});

const spotifyEmbedEntitySchema = z.object({
  title: z.string().optional(),
  name: z.string().optional(),
  artists: z.array(z.object({ name: z.string() })).default([]),
  releaseDate: z.object({ isoString: z.string().optional() }).optional(),
  visualIdentity: z
    .object({
      backgroundBase: rgbaColorSchema.optional(),
      backgroundTintedBase: rgbaColorSchema.optional(),
      textBase: rgbaColorSchema.optional(),
      textBrightAccent: rgbaColorSchema.optional(),
      textSubdued: rgbaColorSchema.optional(),
      image: z
        .array(
          z.object({
            url: z.string(),
            maxWidth: z.number().nullable().optional(),
            maxHeight: z.number().nullable().optional()
          })
        )
        .optional()
    })
    .optional()
});

const spotifyEmbedNextDataSchema = z.object({
  props: z.object({
    pageProps: z.object({
      state: z.object({
        data: z.object({
          entity: spotifyEmbedEntitySchema
        })
      })
    })
  })
});

const spotifyTrackSchema = z.object({
  name: z.string(),
  external_ids: z.object({ isrc: z.string().optional() }).optional(),
  album: z.object({
    release_date: z.string().optional(),
    images: z.array(z.object({ url: z.string(), width: z.number().nullable().optional(), height: z.number().nullable().optional() })).optional()
  }),
  artists: z.array(z.object({ name: z.string() })).default([]),
  external_urls: z.object({ spotify: z.string().optional() }).optional()
});

const spotifyAlbumSchema = z.object({
  name: z.string(),
  release_date: z.string().optional(),
  images: z.array(z.object({ url: z.string(), width: z.number().nullable().optional(), height: z.number().nullable().optional() })).optional(),
  artists: z.array(z.object({ name: z.string() })).default([]),
  external_urls: z.object({ spotify: z.string().optional() }).optional()
});

const spotifyOembedSchema = z.object({
  title: z.string().optional(),
  thumbnail_url: z.string().optional()
});

const spotifyTokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number()
});

type SpotifyResource = {
  type: "album" | "track";
  id: string;
};

export function isSpotifyUrl(url: URL): boolean {
  return url.hostname.endsWith("spotify.com");
}

export function parseSpotifyEmbedHtml(html: string): Partial<ImportedTrack> {
  const nextData = parseNextData(html);
  if (!nextData) return {};

  const parsed = spotifyEmbedNextDataSchema.safeParse(nextData);
  if (!parsed.success) return {};

  const entity = parsed.data.props.pageProps.state.data.entity;
  const artists = entity.artists.map((artist) => artist.name);
  const palette = extractPalette(entity.visualIdentity);
  const artworkUrl = entity.visualIdentity?.image ? pickLargestEmbedImage(entity.visualIdentity.image)?.url : undefined;
  const releaseAt = entity.releaseDate?.isoString?.slice(0, 10);

  return {
    title: entity.title ?? entity.name,
    artistName: artists.join(", ") || undefined,
    artistNames: artists.length ? artists : undefined,
    artworkUrl,
    releaseAt,
    liveAt: releaseAt,
    palette
  };
}

function extractPalette(visualIdentity: z.infer<typeof spotifyEmbedEntitySchema>["visualIdentity"]): TrackPalette | undefined {
  if (!visualIdentity) return undefined;
  const palette: TrackPalette = {};
  if (visualIdentity.backgroundBase) palette.backgroundBase = visualIdentity.backgroundBase;
  if (visualIdentity.backgroundTintedBase) palette.backgroundTintedBase = visualIdentity.backgroundTintedBase;
  if (visualIdentity.textBase) palette.textBase = visualIdentity.textBase;
  if (visualIdentity.textBrightAccent) palette.textBrightAccent = visualIdentity.textBrightAccent;
  if (visualIdentity.textSubdued) palette.textSubdued = visualIdentity.textSubdued;
  return Object.keys(palette).length ? palette : undefined;
}

export async function importSpotify(env: RuntimeEnv, sourceUrl: string): Promise<ImportedTrack> {
  const resource = spotifyResourceFromUrl(sourceUrl);
  let imported: ImportedTrack = {
    provider: "spotify",
    sourceUrl,
    destinations: { spotify: sourceUrl }
  };

  const token = await getSpotifyToken(env);
  if (token && resource?.type === "track") {
    const response = await safeFetchResponse(`https://api.spotify.com/v1/tracks/${resource.id}`, {
      maxBytes: 2_000_000, timeoutMs: 8_000, allowedHosts: ["api.spotify.com"],
      init: { headers: { authorization: `Bearer ${token}` } }
    });
    if (response.ok) {
      const data = spotifyTrackSchema.parse(await response.json());
      imported = {
        provider: "spotify",
        sourceUrl,
        isrc: data.external_ids?.isrc,
        title: data.name,
        artistName: data.artists.map((artist) => artist.name).join(", "),
        artistNames: data.artists.map((artist) => artist.name),
        artworkUrl: pickLargestImage(data.album.images ?? [])?.url,
        releaseAt: data.album.release_date,
        liveAt: data.album.release_date,
        destinations: { spotify: data.external_urls?.spotify ?? sourceUrl }
      };
    }
  }
  if (token && resource?.type === "album") {
    const response = await safeFetchResponse(`https://api.spotify.com/v1/albums/${resource.id}`, {
      maxBytes: 2_000_000, timeoutMs: 8_000, allowedHosts: ["api.spotify.com"],
      init: { headers: { authorization: `Bearer ${token}` } }
    });
    if (response.ok) {
      const data = spotifyAlbumSchema.parse(await response.json());
      imported = {
        provider: "spotify",
        sourceUrl,
        title: data.name,
        artistName: data.artists.map((artist) => artist.name).join(", "),
        artistNames: data.artists.map((artist) => artist.name),
        artworkUrl: pickLargestImage(data.images ?? [])?.url,
        releaseAt: data.release_date,
        liveAt: data.release_date,
        destinations: { spotify: data.external_urls?.spotify ?? sourceUrl }
      };
    }
  }

  if (resource) {
    const embedResponse = await safeFetchResponse(`https://open.spotify.com/embed/${resource.type}/${resource.id}`, {
      maxBytes: 2_000_000, timeoutMs: 8_000, allowedHosts: ["open.spotify.com"]
    });
    if (embedResponse.ok) {
      const embed = parseSpotifyEmbedHtml(await embedResponse.text());
      imported = {
        ...imported,
        title: imported.title ?? embed.title,
        artistName: imported.artistName ?? embed.artistName,
        artistNames: imported.artistNames ?? embed.artistNames,
        artworkUrl: imported.artworkUrl ?? embed.artworkUrl,
        releaseAt: imported.releaseAt ?? embed.releaseAt,
        liveAt: imported.liveAt ?? embed.liveAt,
        palette: embed.palette ?? imported.palette
      };
    }

    if (!imported.title || !imported.artworkUrl) {
      const oembedResponse = await safeFetchResponse(`https://open.spotify.com/oembed?url=${encodeURIComponent(sourceUrl)}`, {
        maxBytes: 2_000_000, timeoutMs: 8_000, allowedHosts: ["open.spotify.com"]
      });
      if (oembedResponse.ok) {
        const oembed = spotifyOembedSchema.parse(await oembedResponse.json());
        imported = {
          ...imported,
          title: imported.title ?? oembed.title,
          artworkUrl: imported.artworkUrl ?? oembed.thumbnail_url
        };
      }
    }
  }

  return imported;
}

async function getSpotifyToken(env: RuntimeEnv): Promise<string | null> {
  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const response = await safeFetchResponse("https://accounts.spotify.com/api/token", {
    maxBytes: 2_000_000,
    timeoutMs: 8_000,
    allowedHosts: ["accounts.spotify.com"],
    init: {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    }
  });
  if (!response.ok) return null;
  const data = spotifyTokenSchema.parse(await response.json());
  return data.access_token;
}

function spotifyResourceFromUrl(sourceUrl: string): SpotifyResource | null {
  const url = new URL(sourceUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const typeIndex = parts[0] === "embed" ? 1 : 0;
  const type = parts[typeIndex];
  const id = parts[typeIndex + 1];
  if ((type === "track" || type === "album") && id) return { type, id };
  return null;
}
