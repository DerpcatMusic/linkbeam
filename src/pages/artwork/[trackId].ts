import type { APIRoute } from "astro";
import { getRuntimeEnv } from "@lib/runtime";

export const GET: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const trackId = context.params.trackId ?? "";
  const row = await env.DB.prepare("SELECT artwork_object_key FROM tracks WHERE id = ?")
    .bind(trackId)
    .first<{ artwork_object_key: string | null }>();
  if (!row?.artwork_object_key) return new Response("Not found", { status: 404 });

  const object = await env.ARTWORK.get(row.artwork_object_key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", headers.get("cache-control") ?? "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
};
