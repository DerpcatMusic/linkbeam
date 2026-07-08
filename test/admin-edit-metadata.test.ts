import { describe, expect, it } from "vitest";
import editPage from "../src/pages/admin/links/[id]/edit.astro?raw";

describe("admin link metadata refresh", () => {
  it("lets an existing link refresh track metadata from a streaming URL", () => {
    expect(editPage).toContain("metadataSource");
    expect(editPage).toContain("refreshMetadataButton");
    expect(editPage).toContain("/api/admin/import-track");
    expect(editPage).toContain("trackId");
  });
});
