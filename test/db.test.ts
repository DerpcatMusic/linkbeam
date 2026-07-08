import { describe, expect, it } from "vitest";
import { createLink, deleteLink, purgeTrackLinkCaches } from "../src/lib/db";
import type { RuntimeEnv } from "../src/lib/runtime";

type Call = { sql: string; bindings: unknown[] };

function makeEnv() {
  const calls: Call[] = [];
  const batches: Call[][] = [];
  const deletedCacheKeys: string[] = [];
  const env = {
    DB: {
      prepare(sql: string) {
        const call: Call = { sql, bindings: [] };
        calls.push(call);
        return {
          __call: call,
          bind(...bindings: unknown[]) {
            call.bindings = bindings;
            return this;
          },
          async run() {
            return { success: true, meta: { changes: 1 } };
          },
          async first() {
            if (sql.includes("FROM links WHERE id")) {
              return {
                id: "lnk_created",
                track_id: "trk_existing",
                link_name: "Launch",
                slug: "launch",
                mode: "presave",
                status: "draft",
                meta_event_name: "ViewContent",
                view_event_name: "ViewContent",
                click_event_name: null,
                page_background_style: "blur",
                button_style: "monochrome",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                published_at: null
              };
            }
            if (sql.includes("FROM tracks")) {
              return {
                id: "trk_existing",
                isrc: null,
                title: "Launch",
                artist_id: "art_1",
                artist_name: "Artist",
                artwork_url: null,
                artwork_object_key: null,
                source_url: null,
                source_provider: "manual",
                release_at: "2026-08-01T10:00:00.000Z",
                live_at: null,
                palette: null
              };
            }
            return null;
          },
          async all() {
            if (sql.includes("FROM links WHERE track_id")) {
              return {
                results: [
                  { slug: "release-one" },
                  { slug: "release-two" }
                ]
              };
            }
            return { results: [] };
          }
        };
      },
      async batch(statements: Array<{ __call: Call }>) {
        batches.push(statements.map((statement) => statement.__call));
        return statements.map(() => ({ success: true, meta: { changes: 1 } }));
      }
    },
    LINK_CACHE: {
      async get() { return null; },
      async put() {},
      async delete(key: string) { deletedCacheKeys.push(key); }
    }
  } as unknown as RuntimeEnv;

  return { env, calls, batches, deletedCacheKeys };
}

describe("createLink", () => {
  it("creates new links as published by default", async () => {
    const { env, calls } = makeEnv();

    const input = {
      linkName: "Launch",
      slug: "launch",
      trackId: "trk_existing",
      mode: "live",
      destinations: { spotify: "https://open.spotify.com/track/123" }
    } as Parameters<typeof createLink>[1];

    await createLink(env, input);

    const insert = calls.find((call) => call.sql.includes("INSERT INTO links"));
    expect(insert?.sql).toContain("status");
    expect(insert?.sql).toContain("published_at");
    expect(insert?.bindings).toEqual([
      expect.stringMatching(/^lnk_/),
      "trk_existing",
      "Launch",
      "launch",
      "live",
      "published",
      "web",
      null,
      "Stream_Click_Paid",
      "blur",
      "monochrome",
      expect.stringContaining('"aurora"')
    ]);
  });

  it("persists Spotify behavior and paid event overrides when creating a link", async () => {
    const { env, calls } = makeEnv();

    const input = {
      linkName: "Launch",
      slug: "launch",
      trackId: "trk_existing",
      mode: "live",
      destinations: { spotify: "https://open.spotify.com/track/123" },
      spotifyOpenBehavior: "app_first",
      spotifyContextUrl: "spotify:playlist:abc123456789",
      paidClickEventName: "Stream_Click_Paid_Meta"
    } as Parameters<typeof createLink>[1];

    await createLink(env, input);

    const insert = calls.find((call) => call.sql.includes("INSERT INTO links"));
    expect(insert?.bindings.slice(-6)).toEqual([
      "app_first",
      "spotify:playlist:abc123456789",
      "Stream_Click_Paid_Meta",
      "blur",
      "monochrome",
      expect.stringContaining('"ascii"')
    ]);
  });

  it("persists releaseAt onto the existing track when creating a link", async () => {
    const { env, calls } = makeEnv();

    const input = {
      linkName: "Launch",
      slug: "launch",
      trackId: "trk_existing",
      mode: "presave",
      releaseAt: "2026-08-01T10:00:00.000Z",
      destinations: { spotify: "https://open.spotify.com/track/123" }
    } as Parameters<typeof createLink>[1] & { releaseAt: string };

    await createLink(env, input);

    const update = calls.find((call) => call.sql.includes("UPDATE tracks SET release_at = ?"));
    expect(update?.bindings).toEqual(["2026-08-01T10:00:00.000Z", "trk_existing"]);
  });
});

describe("deleteLink", () => {
  it("removes link-owned rows and purges the public cache", async () => {
    const { env, batches, deletedCacheKeys } = makeEnv();

    await deleteLink(env, "lnk_created");

    const batchSql = batches.flat().map((call) => call.sql);
    expect(batchSql).toEqual([
      "DELETE FROM destinations WHERE link_id = ?",
      "DELETE FROM subscribers WHERE link_id = ?",
      "DELETE FROM daily_metrics WHERE link_id = ?",
      "DELETE FROM metric_events WHERE link_id = ?",
      "DELETE FROM capi_log WHERE link_id = ?",
      "DELETE FROM links WHERE id = ?"
    ]);
    expect(deletedCacheKeys).toEqual(["link:launch"]);
  });
});

describe("purgeTrackLinkCaches", () => {
  it("removes every published public cache entry for a refreshed track", async () => {
    const { env, deletedCacheKeys } = makeEnv();

    await purgeTrackLinkCaches(env, "trk_existing");

    expect(deletedCacheKeys).toEqual(["link:release-one", "link:release-two"]);
  });
});
