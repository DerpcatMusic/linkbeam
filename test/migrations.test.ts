import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("database migrations", () => {
  it("removes only the stored Meta token from an existing installation", () => {
    const migrationsDir = resolve(import.meta.dirname, "../migrations");
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
    const beforeSecretCleanup = files
      .filter((file) => file < "0014_remove_stored_meta_token.sql")
      .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"))
      .join("\n");
    const secretCleanup = readFileSync(resolve(migrationsDir, "0014_remove_stored_meta_token.sql"), "utf8");
    const fixture = `
      INSERT INTO artists (id, name) VALUES ('artist_1', 'Kept artist');
      INSERT INTO tracks (id, title, artist_id) VALUES ('track_1', 'Kept track', 'artist_1');
      INSERT INTO links (id, track_id, link_name, slug, mode, status) VALUES ('link_1', 'track_1', 'Kept link', 'kept-link', 'live', 'published');
      INSERT INTO destinations (id, link_id, platform, label, url) VALUES ('dest_1', 'link_1', 'spotify', 'Spotify', 'https://open.spotify.com/track/1');
      INSERT INTO metric_events (id, day, link_id, kind) VALUES ('metric_1', '2026-07-10', 'link_1', 'view');
      INSERT INTO subscribers (id, link_id, email) VALUES ('subscriber_1', 'link_1', 'fan@example.com');
      INSERT INTO settings (key, value) VALUES ('meta_access_token', 'must-disappear'), ('meta_pixel_id', 'must-stay');
    `;
    const query = `
      SELECT json_object(
        'links', (SELECT count(*) FROM links),
        'destinations', (SELECT count(*) FROM destinations),
        'metrics', (SELECT count(*) FROM metric_events),
        'subscribers', (SELECT count(*) FROM subscribers),
        'token', (SELECT count(*) FROM settings WHERE key = 'meta_access_token'),
        'pixel', (SELECT count(*) FROM settings WHERE key = 'meta_pixel_id')
      );
    `;
    const result = spawnSync("sqlite3", [":memory:"], {
      encoding: "utf8",
      input: `${beforeSecretCleanup}\n${fixture}\n${secretCleanup}\n${query}`
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({ links: 1, destinations: 1, metrics: 1, subscribers: 1, token: 0, pixel: 1 });
  });
});
