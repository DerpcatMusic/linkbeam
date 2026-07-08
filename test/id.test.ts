import { describe, expect, it } from "vitest";
import { assertSlug, isBareIsrc, normalizeIsrc, normalizeSlug } from "../src/lib/id";

describe("id helpers", () => {
  it("normalizes slugs", () => {
    expect(normalizeSlug(" Late Night (Meta) Campaign! ")).toBe("late-night-meta-campaign");
  });

  it("rejects empty slugs", () => {
    expect(() => assertSlug("!")).toThrow(/Slug/);
  });

  it("normalizes valid ISRCs", () => {
    expect(normalizeIsrc("us-abc-24-00001")).toBe("USABC2400001");
  });

  it("detects bare ISRC input", () => {
    expect(isBareIsrc("USIR20400274")).toBe(true);
    expect(isBareIsrc("usir20400274")).toBe(true);
    expect(isBareIsrc("https://open.spotify.com/track/abc")).toBe(false);
  });

  it("rejects invalid ISRCs", () => {
    expect(() => normalizeIsrc("abc")).toThrow(/ISRC/);
  });
});
