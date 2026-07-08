import { describe, expect, it } from "vitest";
import { computeContrastScrim, parseTrackPalette } from "../src/lib/palette";

const sampleIdentity = {
  backgroundBase: { alpha: 255, red: 114, green: 64, blue: 115 },
  backgroundTintedBase: { alpha: 255, red: 78, green: 30, blue: 79 },
  textBase: { alpha: 255, red: 255, green: 255, blue: 255 },
  textBrightAccent: { alpha: 255, red: 255, green: 255, blue: 255 },
  textSubdued: { alpha: 255, red: 244, green: 186, blue: 244 }
};

describe("parseTrackPalette", () => {
  it("returns defaults for empty input", () => {
    const vars = parseTrackPalette(null);
    expect(vars["--background"]).toBe("oklch(0.115 0.006 260)");
    expect(vars["--scrim-opacity"]).toBe("0.72");
  });

  it("maps Spotify visualIdentity colors to CSS variables", () => {
    const vars = parseTrackPalette(JSON.stringify(sampleIdentity));
    expect(vars["--foreground"]).toBe("rgb(255 255 255)");
    expect(vars["--page-tint"]).toBe("rgb(78 30 79)");
    expect(Number(vars["--scrim-opacity"])).toBeGreaterThan(0);
    expect(Number(vars["--scrim-opacity"])).toBeLessThanOrEqual(0.92);
  });

  it("accepts wrapped visualIdentity payloads", () => {
    const vars = parseTrackPalette(JSON.stringify({ visualIdentity: sampleIdentity }));
    expect(vars["--page-tint"]).toBe("rgb(78 30 79)");
  });
});

describe("computeContrastScrim", () => {
  it("keeps a light scrim when contrast already passes AA", () => {
    const opacity = computeContrastScrim(
      { red: 255, green: 255, blue: 255 },
      { red: 20, green: 20, blue: 24 }
    );
    expect(opacity).toBeLessThanOrEqual(0.5);
  });

  it("raises scrim opacity for low-contrast pairs", () => {
    const opacity = computeContrastScrim(
      { red: 200, green: 200, blue: 200 },
      { red: 180, green: 170, blue: 160 }
    );
    expect(opacity).toBeGreaterThan(0.42);
  });
});
