export type RgbColor = { red: number; green: number; blue: number; alpha?: number };

export type SpotifyVisualIdentity = {
  backgroundBase?: RgbColor;
  backgroundTintedBase?: RgbColor;
  textBase?: RgbColor;
  textBrightAccent?: RgbColor;
  textSubdued?: RgbColor;
};

export type TrackPaletteVars = Record<string, string>;

const DEFAULT_VARS: TrackPaletteVars = {
  "--background": "oklch(0.115 0.006 260)",
  "--foreground": "oklch(0.965 0.004 260)",
  "--border": "oklch(0.92 0.004 260 / 0.16)",
  "--primary": "oklch(0.86 0.006 260)",
  "--surface": "oklch(0.18 0.006 260)",
  "--surface-2": "oklch(0.235 0.006 260)",
  "--muted": "oklch(0.72 0.006 260)",
  "--primary-ink": "oklch(0.15 0.006 260)",
  "--page-tint": "oklch(0.115 0.006 260)",
  "--scrim-opacity": "0.72"
};

export function parseTrackPalette(json: string | null | undefined): TrackPaletteVars {
  if (!json?.trim()) return { ...DEFAULT_VARS };

  try {
    const parsed = JSON.parse(json) as SpotifyVisualIdentity | { visualIdentity?: SpotifyVisualIdentity };
    const identity = "visualIdentity" in parsed && parsed.visualIdentity ? parsed.visualIdentity : (parsed as SpotifyVisualIdentity);
    if (!identity.backgroundBase && !identity.backgroundTintedBase) return { ...DEFAULT_VARS };

    const background = identity.backgroundTintedBase ?? identity.backgroundBase!;
    const foreground = identity.textBase ?? { red: 255, green: 255, blue: 255 };
    const accent = identity.textBrightAccent ?? lightenRgb(background, 0.22);
    const subdued = identity.textSubdued ?? mixRgb(foreground, background, 0.45);

    const scrimOpacity = computeContrastScrim(foreground, background);

    return {
      "--background": toCssColor(darkenRgb(background, 0.18)),
      "--foreground": toCssColor(foreground),
      "--border": toCssColor(mixRgb(foreground, background, 0.82), 0.16),
      "--primary": toCssColor(accent),
      "--surface": toCssColor(darkenRgb(background, 0.08), 0.9),
      "--surface-2": toCssColor(darkenRgb(background, 0.04), 0.94),
      "--muted": toCssColor(subdued, 0.92),
      "--primary-ink": toCssColor(pickPrimaryInk(accent)),
      "--page-tint": toCssColor(background),
      "--scrim-opacity": String(scrimOpacity)
    };
  } catch {
    return { ...DEFAULT_VARS };
  }
}

export function computeContrastScrim(foreground: RgbColor, background: RgbColor): number {
  const fgL = relativeLuminance(foreground);
  const bgL = relativeLuminance(background);
  if (contrastRatio(fgL, bgL) >= 4.5) return 0.42;

  let opacity = 0.42;
  for (let step = 0; step < 16; step += 1) {
    const blended = blendWithBlack(bgL, opacity);
    if (contrastRatio(fgL, blended) >= 4.5) return roundOpacity(opacity);
    opacity += 0.04;
  }
  return 0.88;
}

export function paletteStyleAttribute(vars: TrackPaletteVars): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}

function toCssColor(color: RgbColor, alpha = 1): string {
  const a = color.alpha !== undefined ? color.alpha / 255 : alpha;
  if (a >= 1) return `rgb(${clampByte(color.red)} ${clampByte(color.green)} ${clampByte(color.blue)})`;
  return `rgb(${clampByte(color.red)} ${clampByte(color.green)} ${clampByte(color.blue)} / ${roundOpacity(a)})`;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function roundOpacity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function relativeLuminance(color: RgbColor): number {
  const channels = [color.red, color.green, color.blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function blendWithBlack(backgroundLuminance: number, opacity: number): number {
  return backgroundLuminance * (1 - opacity);
}

function darkenRgb(color: RgbColor, amount: number): RgbColor {
  return {
    red: color.red * (1 - amount),
    green: color.green * (1 - amount),
    blue: color.blue * (1 - amount),
    alpha: color.alpha
  };
}

function lightenRgb(color: RgbColor, amount: number): RgbColor {
  return {
    red: color.red + (255 - color.red) * amount,
    green: color.green + (255 - color.green) * amount,
    blue: color.blue + (255 - color.blue) * amount,
    alpha: color.alpha
  };
}

function mixRgb(a: RgbColor, b: RgbColor, weight: number): RgbColor {
  const w = Math.max(0, Math.min(1, weight));
  return {
    red: a.red * (1 - w) + b.red * w,
    green: a.green * (1 - w) + b.green * w,
    blue: a.blue * (1 - w) + b.blue * w
  };
}

function pickPrimaryInk(accent: RgbColor): RgbColor {
  return relativeLuminance(accent) > 0.62
    ? { red: 18, green: 18, blue: 22 }
    : { red: 250, green: 250, blue: 252 };
}
