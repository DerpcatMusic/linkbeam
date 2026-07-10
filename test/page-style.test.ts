import { describe, expect, it } from "vitest";
import {
  asciiPatternDataUri,
  compactAsciiPatternDataUri,
  STYLE_CARD_PREVIEW_PALETTE,
  backgroundClasses,
  buttonClasses,
  normalizeButtonStyle,
  normalizePageBackgroundStyle,
  platformButtonInk,
  platformBrandStyle,
  platformIconInk,
  platformIconTint
} from "../src/lib/page-style";

describe("normalizePageBackgroundStyle", () => {
  it("returns blur for unknown values", () => {
    expect(normalizePageBackgroundStyle("invalid")).toBe("blur");
    expect(normalizePageBackgroundStyle(null)).toBe("blur");
  });

  it("accepts valid background styles", () => {
    expect(normalizePageBackgroundStyle("mesh")).toBe("mesh");
    expect(normalizePageBackgroundStyle("aurora")).toBe("aurora");
  });
});

describe("normalizeButtonStyle", () => {
  it("returns monochrome for unknown values", () => {
    expect(normalizeButtonStyle(undefined)).toBe("monochrome");
  });

  it("accepts valid button styles", () => {
    expect(normalizeButtonStyle("full-color")).toBe("full-color");
    expect(normalizeButtonStyle("gradient-logo")).toBe("gradient-logo");
  });
});

describe("platform helpers", () => {
  it("maps class names from style enums", () => {
    expect(backgroundClasses("vinyl")).toBe("smart-page--bg-vinyl");
    expect(buttonClasses("colored-border")).toBe("smart-page--btn-colored-border");
  });

  it("tints icons for logo-forward button styles", () => {
    expect(platformIconTint("monochrome")).toBe(false);
    expect(platformIconTint("logo-color")).toBe(true);
    expect(platformIconTint("gradient-logo")).toBe(true);
    expect(platformIconTint("full-color")).toBe(false);
  });

  it("uses ink icons on full-color fills", () => {
    expect(platformIconInk("full-color")).toBe(true);
    expect(platformIconInk("logo-color")).toBe(false);
  });

  it("picks readable ink on brand fills", () => {
    expect(platformButtonInk("#1ED760")).toMatch(/0\.15|0\.98/);
    expect(platformBrandStyle("spotify")).toContain("--platform-brand: #1ED760");
  });
});

describe("asciiPatternDataUri", () => {
  it("keeps the encoded fallback below 4 KB", () => {
    expect(compactAsciiPatternDataUri(STYLE_CARD_PREVIEW_PALETTE, 0.7).length).toBeLessThan(4_000);
  });
  it("returns an encoded SVG data URI", () => {
    const uri = asciiPatternDataUri({
      "--page-tint": "rgb(78 30 79)",
      "--primary": "rgb(255 255 255)",
      "--muted": "rgb(200 180 200)"
    });
    expect(uri.startsWith('url("data:image/svg+xml,')).toBe(true);
    const decoded = decodeURIComponent(uri);
    expect(decoded).toContain("<text");
    expect(decoded).toContain("font-weight=\"700\"");
  });

  it("keeps density out of the server-rendered fallback", () => {
    const coarse = asciiPatternDataUri({
      "--page-tint": "rgb(78 30 79)",
      "--primary": "rgb(255 255 255)",
      "--muted": "rgb(200 180 200)"
    }, "sm");
    const balanced = asciiPatternDataUri({
      "--page-tint": "rgb(78 30 79)",
      "--primary": "rgb(255 255 255)",
      "--muted": "rgb(200 180 200)"
    }, "md");
    expect(coarse).toBe(balanced);
    expect(decodeURIComponent(coarse)).toContain('width="52"');
  });
});
