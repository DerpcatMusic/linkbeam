import type { AsciiDensity } from "@lib/page-style-options";
import { asciiGridSize } from "@lib/page-style-options";
import type { TrackPaletteVars } from "@lib/palette";

/** Dense → sparse: darker pixels map to denser glyphs. */
export const ASCII_CHARSET = " .:-=+*#%@";

export interface AsciiCell {
  char: string;
  color: string;
}

export interface AsciiGrid {
  cols: number;
  rows: number;
  cells: AsciiCell[];
}

export function luminanceFromRgb(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function charForLuminance(luma: number, contrast = 0.7): string {
  const mid = 0.5;
  const adjusted = clamp01(mid + (luma - mid) * (0.55 + contrast * 0.75));
  const inverted = 1 - adjusted;
  const index = Math.min(ASCII_CHARSET.length - 1, Math.floor(inverted * ASCII_CHARSET.length));
  return ASCII_CHARSET[index] ?? " ";
}

/** Build a grid from raw RGBA pixel buffer (row-major, 4 bytes/pixel). */
export function gridFromRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  density: AsciiDensity,
  _vars: TrackPaletteVars,
  contrast: number
): AsciiGrid {
  const { cols, rows } = asciiGridSize(density);
  const cells: AsciiCell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) / cols) * width));
      const sy = Math.min(height - 1, Math.floor(((y + 0.5) / rows) * height));
      const i = (sy * width + sx) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const luma = luminanceFromRgb(r, g, b);
      cells.push({
        char: charForLuminance(luma, contrast),
        color: `rgb(${r} ${g} ${b})`
      });
    }
  }
  return { cols, rows, cells };
}

/** Deterministic palette-tinted fallback when artwork pixels are unavailable. */
export function proceduralAsciiGrid(
  density: AsciiDensity,
  vars: TrackPaletteVars,
  contrast: number
): AsciiGrid {
  const { cols, rows } = asciiGridSize(density);
  const accent = vars["--primary"] ?? "oklch(0.72 0.12 300)";
  const tint = vars["--page-tint"] ?? "oklch(0.2 0.04 280)";
  const muted = vars["--muted"] ?? "oklch(0.55 0.03 280)";
  const cells: AsciiCell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const nx = x / cols;
      const ny = y / rows;
      const wave = 0.55 + 0.35 * Math.sin(nx * 6.2 + ny * 3.1) * Math.cos(ny * 5.4 - nx * 2.2);
      const radial = 1 - Math.hypot(nx - 0.5, ny - 0.48) * 1.35;
      const luma = clamp01(wave * 0.55 + radial * 0.45);
      const char = charForLuminance(luma, contrast);
      const color = luma > 0.62 ? accent : luma > 0.35 ? tint : muted;
      cells.push({ char, color });
    }
  }
  return { cols, rows, cells };
}

export function asciiGridToSvgDataUri(grid: AsciiGrid, vars: TrackPaletteVars): string {
  const tint = vars["--page-tint"] ?? "oklch(0.2 0.04 280)";
  const cellW = 9;
  const cellH = 10;
  const width = grid.cols * cellW;
  const height = grid.rows * cellH;
  const parts: string[] = [
    `<rect width="100%" height="100%" fill="${escapeXml(tint)}" opacity="0.18"/>`,
    `<rect width="100%" height="100%" fill="oklch(0.08 0.01 265)" opacity="0.4"/>`
  ];
  for (let y = 0; y < grid.rows; y += 1) {
    for (let x = 0; x < grid.cols; x += 1) {
      const cell = grid.cells[y * grid.cols + x];
      if (!cell || cell.char === " ") continue;
      const px = 2 + x * cellW;
      const py = 8 + y * cellH;
      parts.push(
        `<text x="${px}" y="${py}" fill="${escapeXml(cell.color)}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="9" font-weight="700" opacity="0.9">${escapeXml(cell.char)}</text>`
      );
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
