import type { APIRoute } from "astro";
import { purgeTrackLinkCaches, setTrackArtworkObject, upsertTrackFromImport } from "@lib/db";
import { cacheArtwork } from "@lib/artwork";
import { importBodySchema } from "@lib/validation";
import { importTooLostTrack, importTrackFromInput } from "@lib/importers";
import { badRequest, json, readJson } from "@lib/http";
import { getRuntimeEnv, requireAdmin } from "@lib/runtime";

export const POST: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;

  try {
    const body = importBodySchema.parse(await readJson<unknown>(context.request));
    const importInput = (body.importInput ?? body.sourceUrl ?? "").trim();
    const sourceImported = body.isrc && body.title && (body.artistName || body.artistNames?.length)
      ? await importTooLostTrack({
          sourceUrl: importInput || body.isrc,
          isrc: body.isrc,
          title: body.title,
          artistName: body.artistName ?? body.artistNames?.join(", ") ?? "",
          artistNames: body.artistNames,
          artworkUrl: body.artworkUrl,
          releaseAt: body.releaseAt
        })
      : await importTrackFromInput(env, importInput);

    const imported = {
      ...sourceImported,
      isrc: body.isrc || sourceImported.isrc,
      title: body.title || sourceImported.title,
      artistName: body.artistName || sourceImported.artistName,
      artistNames: body.artistNames?.length ? body.artistNames : sourceImported.artistNames,
      artworkUrl: body.artworkUrl || sourceImported.artworkUrl,
      releaseAt: body.releaseAt || sourceImported.releaseAt
    };

    const hasArtists = Boolean(imported.artistNames?.length || imported.artistName);
    const track = imported.title && hasArtists
      ? await upsertTrackFromImport(env, imported, body.trackId)
      : null;

    if (track) {
      const artworkKey = await cacheArtwork(env, imported, track);
      if (artworkKey) {
        await setTrackArtworkObject(env, track.id, artworkKey);
        track.artwork_object_key = artworkKey;
      }
      await purgeTrackLinkCaches(env, track.id);
    }

    return json({ imported, track });
  } catch (error) {
    if (error instanceof Response) return error;
    return badRequest(error instanceof Error ? error.message : "Import failed.");
  }
};
