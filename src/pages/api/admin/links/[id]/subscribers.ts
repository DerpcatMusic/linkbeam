import type { APIRoute } from "astro";
import { getLinkById, listSubscribers } from "@lib/db";
import { notFound } from "@lib/http";
import { getRuntimeEnv, requireAdmin } from "@lib/runtime";

export const GET: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const blocked = await requireAdmin(context.request, env);
  if (blocked) return blocked;

  const link = await getLinkById(env, context.params.id ?? "");
  if (!link) return notFound();

  const subscribers = await listSubscribers(env, link.id);
  const rows = ["email,consented_at", ...subscribers.map((row) => `${csvEscape(row.email)},${csvEscape(row.consented_at)}`)];
  const csv = rows.join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${link.slug}-subscribers.csv"`
    }
  });
};

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
