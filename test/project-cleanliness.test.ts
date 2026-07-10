import { describe, expect, it } from "vitest";
import wrangler from "../wrangler.jsonc?raw";
import cleanup from "../migrations/0008_cleanup_legacy.sql?raw";
import pkg from "../package.json";

describe("project cleanup", () => {
  it("does not keep a user-managed Astro SESSION namespace in source config", () => {
    expect(wrangler).not.toContain('"binding": "SESSION"');
  });

  it("has a final migration that removes legacy audit and meta event schema", () => {
    expect(cleanup).toContain("DROP TABLE IF EXISTS audit_log");
    expect(cleanup).toContain("DROP COLUMN meta_event_name");
  });

  it("pins Bun and exposes deterministic dev and smoke commands", () => {
    expect(pkg.packageManager).toBe("bun@1.3.14");
    expect(pkg.scripts.dev).toBe("wrangler d1 migrations apply DB --local && bun scripts/dev.mjs");
    expect(pkg.scripts.smoke).toBe("bash scripts/smoke-worker.sh");
  });
});
