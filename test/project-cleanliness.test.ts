import { describe, expect, it } from "vitest";
import wrangler from "../wrangler.jsonc?raw";
import cleanup from "../migrations/0008_cleanup_legacy.sql?raw";

describe("project cleanup", () => {
  it("does not keep a user-managed Astro SESSION namespace in source config", () => {
    expect(wrangler).not.toContain('"binding": "SESSION"');
  });

  it("has a final migration that removes legacy audit and meta event schema", () => {
    expect(cleanup).toContain("DROP TABLE IF EXISTS audit_log");
    expect(cleanup).toContain("DROP COLUMN meta_event_name");
  });
});
