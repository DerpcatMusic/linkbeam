import { describe, expect, it } from "vitest";
import { effectiveDraftMode, resolvePreviewDraft, type PreviewDraft } from "../src/lib/preview-draft";

describe("preview-draft", () => {
  it("resolves destinations and style defaults", () => {
    const resolved = resolvePreviewDraft({
      title: "Night Drive",
      artistName: "Aster",
      destinations: {
        spotify: "https://open.spotify.com/track/1",
        apple: ""
      },
      pageBackgroundStyle: "mesh",
      buttonStyle: "full-color"
    } satisfies PreviewDraft);

    expect(resolved.title).toBe("Night Drive");
    expect(resolved.destinations).toHaveLength(1);
    expect(resolved.destinations[0]?.platform).toBe("spotify");
    expect(resolved.pageBackgroundStyle).toBe("mesh");
    expect(resolved.buttonStyle).toBe("full-color");
  });

  it("switches to presave labels for future releases", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const resolved = resolvePreviewDraft({
      mode: "presave",
      releaseAt: future,
      destinations: { spotify: "https://open.spotify.com/track/1" }
    } satisfies PreviewDraft);

    expect(resolved.effectiveMode).toBe("presave");
    expect(resolved.destinations[0]?.cta).toBe("Pre-save on Spotify");
  });

  it("treats past presave dates as live", () => {
    expect(effectiveDraftMode("presave", new Date(Date.now() - 1000).toISOString())).toBe("live");
  });
});
