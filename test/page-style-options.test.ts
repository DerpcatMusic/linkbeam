import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_STYLE_OPTIONS,
  normalizePageStyleOptions,
  parsePageStyleOptionsJson,
  styleOptionsCssVars
} from "../src/lib/page-style-options";
import {
  charForLuminance,
  gridFromRgba,
  proceduralAsciiGrid,
  asciiGridToSvgDataUri
} from "../src/lib/ascii-mosaic";

describe("normalizePageStyleOptions", () => {
  it("returns defaults for empty input", () => {
    expect(normalizePageStyleOptions(null)).toEqual(DEFAULT_PAGE_STYLE_OPTIONS);
  });

  it("clamps out-of-range values", () => {
    const next = normalizePageStyleOptions({
      aurora: { speed: 99, intensity: -1, blur: 0.1 }
    });
    expect(next.aurora.speed).toBe(2);
    expect(next.aurora.intensity).toBe(0.35);
    expect(next.aurora.blur).toBe(0.5);
  });

  it("accepts ascii density and motion enums", () => {
    const next = normalizePageStyleOptions({
      ascii: { density: "lg", contrast: 1, motion: "shimmer" }
    });
    expect(next.ascii.density).toBe("lg");
    expect(next.ascii.motion).toBe("shimmer");
  });

  it("falls back invalid ascii enums", () => {
    const next = normalizePageStyleOptions({
      ascii: { density: "huge", motion: "bounce" }
    });
    expect(next.ascii.density).toBe("md");
    expect(next.ascii.motion).toBe("live");
  });
});

describe("parsePageStyleOptionsJson", () => {
  it("parses JSON strings", () => {
    const json = JSON.stringify({ mesh: { speed: 1.5 } });
    expect(parsePageStyleOptionsJson(json).mesh.speed).toBe(1.5);
  });
});

describe("styleOptionsCssVars", () => {
  it("emits aurora CSS vars", () => {
    const css = styleOptionsCssVars("aurora", DEFAULT_PAGE_STYLE_OPTIONS);
    expect(css).toContain("--fx-speed:");
    expect(css).toContain("--fx-blur:");
  });

  it("emits ascii CSS vars", () => {
    const css = styleOptionsCssVars("ascii", DEFAULT_PAGE_STYLE_OPTIONS);
    expect(css).toContain("--ascii-tile:");
    expect(css).toContain("--ascii-motion: live");
  });
});

describe("ascii mosaic", () => {
  it("maps luminance to denser glyphs for darker pixels", () => {
    expect(charForLuminance(0.1, 0.7)).not.toBe(" ");
    expect(charForLuminance(0.95, 0.7)).toBe(" ");
  });

  it("builds a grid from rgba buffer", () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = i % 255;
      data[i + 1] = 40;
      data[i + 2] = 120;
      data[i + 3] = 255;
    }
    const grid = gridFromRgba(
      data,
      width,
      height,
      "sm",
      { "--primary": "rgb(255 255 255)", "--page-tint": "rgb(80 20 90)", "--muted": "rgb(120 120 120)" },
      0.7
    );
    expect(grid.cols).toBe(48);
    expect(grid.rows).toBe(28);
    expect(grid.cells).toHaveLength(48 * 28);
  });

  it("renders procedural SVG data URI", () => {
    const grid = proceduralAsciiGrid("md", {
      "--primary": "rgb(255 255 255)",
      "--page-tint": "rgb(80 20 90)",
      "--muted": "rgb(120 120 120)"
    }, 0.7);
    const uri = asciiGridToSvgDataUri(grid, {
      "--page-tint": "rgb(80 20 90)"
    });
    expect(uri.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(uri)).toContain("<text");
  });
});
