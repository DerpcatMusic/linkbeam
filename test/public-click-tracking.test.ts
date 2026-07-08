import { describe, expect, it } from "vitest";
import smartlinkPage from "../src/pages/[slug].astro?raw";

describe("public smartlink click tracking", () => {
  it("marks destination links for browser-side click tracking", () => {
    expect(smartlinkPage).toContain("data-track-click");
    expect(smartlinkPage).toContain("data-event-id");
    expect(smartlinkPage).toContain("data-event-name");
    expect(smartlinkPage).toContain("data-paid-event-name");
    expect(smartlinkPage).toContain("data-app-uri");
    expect(smartlinkPage).toContain("track_only");
    expect(smartlinkPage).toContain("firePixelEvent");
  });
});
