import type { PageBackgroundStyle } from "@lib/page-style";

export type AsciiDensity = "sm" | "md" | "lg";
export type AsciiMotion = "static" | "shimmer" | "live";

export interface BlurOptions {
  intensity: number;
  saturate: number;
}

export interface AsciiOptions {
  density: AsciiDensity;
  contrast: number;
  motion: AsciiMotion;
}

export interface MeshOptions {
  speed: number;
  intensity: number;
}

export interface AuroraOptions {
  speed: number;
  intensity: number;
  blur: number;
}

export interface VinylOptions {
  speed: number;
  intensity: number;
}

export interface PageStyleOptions {
  blur: BlurOptions;
  ascii: AsciiOptions;
  mesh: MeshOptions;
  aurora: AuroraOptions;
  vinyl: VinylOptions;
}

export const DEFAULT_PAGE_STYLE_OPTIONS: PageStyleOptions = {
  blur: { intensity: 1, saturate: 1 },
  ascii: { density: "md", contrast: 0.7, motion: "live" },
  mesh: { speed: 1, intensity: 1 },
  aurora: { speed: 1, intensity: 1, blur: 1 },
  vinyl: { speed: 1, intensity: 1 }
};

const ASCII_DENSITIES: AsciiDensity[] = ["sm", "md", "lg"];
const ASCII_MOTIONS: AsciiMotion[] = ["static", "shimmer", "live"];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function normalizePageStyleOptions(raw: unknown): PageStyleOptions {
  const root = asRecord(raw);
  const blur = asRecord(root.blur);
  const ascii = asRecord(root.ascii);
  const mesh = asRecord(root.mesh);
  const aurora = asRecord(root.aurora);
  const vinyl = asRecord(root.vinyl);

  const densityRaw = typeof ascii.density === "string" ? ascii.density : DEFAULT_PAGE_STYLE_OPTIONS.ascii.density;
  const motionRaw = typeof ascii.motion === "string" ? ascii.motion : DEFAULT_PAGE_STYLE_OPTIONS.ascii.motion;

  return {
    blur: {
      intensity: num(blur.intensity, DEFAULT_PAGE_STYLE_OPTIONS.blur.intensity, 0.4, 1.6),
      saturate: num(blur.saturate, DEFAULT_PAGE_STYLE_OPTIONS.blur.saturate, 0.5, 1.8)
    },
    ascii: {
      density: ASCII_DENSITIES.includes(densityRaw as AsciiDensity)
        ? (densityRaw as AsciiDensity)
        : DEFAULT_PAGE_STYLE_OPTIONS.ascii.density,
      contrast: num(ascii.contrast, DEFAULT_PAGE_STYLE_OPTIONS.ascii.contrast, 0.3, 1.2),
      motion: ASCII_MOTIONS.includes(motionRaw as AsciiMotion)
        ? (motionRaw as AsciiMotion)
        : DEFAULT_PAGE_STYLE_OPTIONS.ascii.motion
    },
    mesh: {
      speed: num(mesh.speed, DEFAULT_PAGE_STYLE_OPTIONS.mesh.speed, 0.35, 2),
      intensity: num(mesh.intensity, DEFAULT_PAGE_STYLE_OPTIONS.mesh.intensity, 0.35, 1.6)
    },
    aurora: {
      speed: num(aurora.speed, DEFAULT_PAGE_STYLE_OPTIONS.aurora.speed, 0.35, 2),
      intensity: num(aurora.intensity, DEFAULT_PAGE_STYLE_OPTIONS.aurora.intensity, 0.35, 1.6),
      blur: num(aurora.blur, DEFAULT_PAGE_STYLE_OPTIONS.aurora.blur, 0.5, 1.8)
    },
    vinyl: {
      speed: num(vinyl.speed, DEFAULT_PAGE_STYLE_OPTIONS.vinyl.speed, 0.35, 2),
      intensity: num(vinyl.intensity, DEFAULT_PAGE_STYLE_OPTIONS.vinyl.intensity, 0.35, 1.6)
    }
  };
}

export function parsePageStyleOptionsJson(json: string | null | undefined): PageStyleOptions {
  if (!json?.trim()) return { ...DEFAULT_PAGE_STYLE_OPTIONS, blur: { ...DEFAULT_PAGE_STYLE_OPTIONS.blur }, ascii: { ...DEFAULT_PAGE_STYLE_OPTIONS.ascii }, mesh: { ...DEFAULT_PAGE_STYLE_OPTIONS.mesh }, aurora: { ...DEFAULT_PAGE_STYLE_OPTIONS.aurora }, vinyl: { ...DEFAULT_PAGE_STYLE_OPTIONS.vinyl } };
  try {
    return normalizePageStyleOptions(JSON.parse(json));
  } catch {
    return normalizePageStyleOptions(null);
  }
}

export function serializePageStyleOptions(options: PageStyleOptions): string {
  return JSON.stringify(normalizePageStyleOptions(options));
}

/** CSS custom properties for the active background style. */
export function styleOptionsCssVars(style: PageBackgroundStyle, options: PageStyleOptions): string {
  const normalized = normalizePageStyleOptions(options);
  switch (style) {
    case "blur":
      return [
        `--fx-intensity: ${normalized.blur.intensity}`,
        `--fx-saturate: ${normalized.blur.saturate}`
      ].join("; ");
    case "ascii": {
      const cell =
        normalized.ascii.density === "sm" ? "14px 11px" : normalized.ascii.density === "lg" ? "9px 7px" : "11px 9px";
      const tile =
        normalized.ascii.density === "sm" ? "240px 192px" : normalized.ascii.density === "lg" ? "160px 128px" : "200px 160px";
      return [
        `--ascii-contrast: ${normalized.ascii.contrast}`,
        `--ascii-cell: ${cell}`,
        `--ascii-tile: ${tile}`,
        `--ascii-motion: ${normalized.ascii.motion}`
      ].join("; ");
    }
    case "mesh":
      return [
        `--fx-speed: ${normalized.mesh.speed}`,
        `--fx-intensity: ${normalized.mesh.intensity}`
      ].join("; ");
    case "aurora":
      return [
        `--fx-speed: ${normalized.aurora.speed}`,
        `--fx-intensity: ${normalized.aurora.intensity}`,
        `--fx-blur: ${normalized.aurora.blur}`
      ].join("; ");
    case "vinyl":
      return [
        `--fx-speed: ${normalized.vinyl.speed}`,
        `--fx-intensity: ${normalized.vinyl.intensity}`
      ].join("; ");
    default:
      return "";
  }
}

export function asciiGridSize(density: AsciiDensity): { cols: number; rows: number } {
  if (density === "sm") return { cols: 48, rows: 28 };
  if (density === "lg") return { cols: 96, rows: 56 };
  return { cols: 72, rows: 42 };
}
