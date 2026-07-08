import { asciiGridToSvgDataUri, proceduralAsciiGrid } from "@lib/ascii-mosaic";
import type { AsciiDensity } from "@lib/page-style-options";
import type { Platform } from "@lib/types";
import { platformBrandColors } from "@lib/platform-brand";
import type { TrackPaletteVars } from "@lib/palette";

export const PAGE_BACKGROUND_STYLES = ["blur", "ascii", "mesh", "aurora", "vinyl"] as const;
export type PageBackgroundStyle = (typeof PAGE_BACKGROUND_STYLES)[number];

export const BUTTON_STYLES = [
  "monochrome",
  "logo-color",
  "colored-border",
  "gradient-lr",
  "gradient-logo",
  "full-color"
] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export const DEFAULT_PAGE_BACKGROUND_STYLE: PageBackgroundStyle = "blur";
export const DEFAULT_BUTTON_STYLE: ButtonStyle = "monochrome";

export const pageBackgroundLabels: Record<PageBackgroundStyle, string> = {
  blur: "Blurred artwork",
  ascii: "ASCII mosaic",
  mesh: "Mesh gradient",
  aurora: "Aurora glow",
  vinyl: "Vinyl ripples"
};

export const pageBackgroundDescriptions: Record<PageBackgroundStyle, string> = {
  blur: "Soft cover art bloom — the current default.",
  ascii: "Character mosaic sampled from the cover art.",
  mesh: "Layered radial gradients from artwork colors.",
  aurora: "Drifting luminous color fields behind the release.",
  vinyl: "Concentric grooves echoing the album palette."
};

export const buttonStyleLabels: Record<ButtonStyle, string> = {
  monochrome: "Monochrome",
  "logo-color": "Logo color",
  "colored-border": "Colored border",
  "gradient-lr": "Gradient L→R",
  "gradient-logo": "Gradient + logo",
  "full-color": "Full color"
};

export const buttonStyleDescriptions: Record<ButtonStyle, string> = {
  monochrome: "Neutral glass buttons with white primary CTA.",
  "logo-color": "Platform brand tint on each icon.",
  "colored-border": "Subtle brand-colored outlines.",
  "gradient-lr": "Monochrome left edge fading into brand color.",
  "gradient-logo": "Gradient fill with tinted platform icons.",
  "full-color": "Solid platform-colored buttons."
};

export function normalizePageBackgroundStyle(value: string | null | undefined): PageBackgroundStyle {
  if (value && PAGE_BACKGROUND_STYLES.includes(value as PageBackgroundStyle)) {
    return value as PageBackgroundStyle;
  }
  return DEFAULT_PAGE_BACKGROUND_STYLE;
}

export function normalizeButtonStyle(value: string | null | undefined): ButtonStyle {
  if (value && BUTTON_STYLES.includes(value as ButtonStyle)) {
    return value as ButtonStyle;
  }
  return DEFAULT_BUTTON_STYLE;
}

export function platformIconTint(buttonStyle: ButtonStyle): boolean {
  return buttonStyle === "logo-color" || buttonStyle === "gradient-logo";
}

/** Full-color fills use ink on icons — brand tint on brand bg is invisible. */
export function platformIconInk(buttonStyle: ButtonStyle): boolean {
  return buttonStyle === "full-color";
}

export function platformBrandStyle(platform: Platform): string {
  const brand = platformBrandColors[platform];
  const ink = platformButtonInk(brand);
  return `--platform-brand: ${brand}; --platform-ink: ${ink}`;
}

export function platformButtonInk(brandHex: string): string {
  const rgb = parseHexColor(brandHex);
  if (!rgb) return "oklch(0.15 0.006 265)";
  const luminance = relativeLuminance(rgb);
  return luminance > 0.58 ? "oklch(0.15 0.006 265)" : "oklch(0.98 0.004 265)";
}

export function backgroundClasses(style: PageBackgroundStyle): string {
  return `smart-page--bg-${style}`;
}

export function buttonClasses(style: ButtonStyle): string {
  return `smart-page--btn-${style}`;
}

/** Fixed palette for admin style-card thumbnails. */
export const STYLE_CARD_PREVIEW_PALETTE: TrackPaletteVars = {
  "--page-tint": "oklch(0.55 0.14 320)",
  "--primary": "oklch(0.72 0.12 300)",
  "--muted": "oklch(0.62 0.05 285)"
};

/** SVG tile for ASCII backgrounds — artwork-shaped procedural mosaic until canvas hydrates. */
export function asciiPatternDataUri(
  vars: TrackPaletteVars,
  density: AsciiDensity = "md",
  contrast = 0.7
): string {
  // Keep SSR/fallback tiles modest; live canvas can render finer density.
  const fallbackDensity: AsciiDensity = density === "lg" ? "md" : density;
  return asciiGridToSvgDataUri(proceduralAsciiGrid(fallbackDensity, vars, contrast), vars);
}

function parseHexColor(hex: string): { red: number; green: number; blue: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function relativeLuminance(color: { red: number; green: number; blue: number }): number {
  const channels = [color.red, color.green, color.blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

