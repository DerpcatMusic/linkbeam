import { presaveDestinationLabel } from "@lib/effective-mode";
import { normalizeButtonStyle, normalizePageBackgroundStyle } from "@lib/page-style";
import { platformLabels, type LinkMode, type Platform } from "@lib/types";
import { z } from "zod";

const platformSchema = z.enum([
  "spotify",
  "apple",
  "youtube",
  "soundcloud",
  "bandcamp",
  "deezer",
  "tidal",
  "amazon",
  "other"
]);

export const previewDraftSchema = z.object({
  title: z.string().optional(),
  artistName: z.string().optional(),
  isrc: z.string().optional(),
  artworkUrl: z.string().optional(),
  palette: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  releaseAt: z.string().nullable().optional(),
  mode: z.enum(["live", "presave"]).optional(),
  pageBackgroundStyle: z.string().optional(),
  buttonStyle: z.string().optional(),
  destinations: z.partialRecord(platformSchema, z.string()).optional()
});

export type PreviewDraft = z.infer<typeof previewDraftSchema>;

export interface PreviewDestination {
  platform: Platform;
  label: string;
  cta: string;
}

export interface ResolvedPreviewDraft {
  title: string;
  artistName: string;
  isrc: string | null;
  artworkUrl: string;
  paletteJson: string | null;
  releaseAt: string | null;
  effectiveMode: LinkMode;
  pageBackgroundStyle: ReturnType<typeof normalizePageBackgroundStyle>;
  buttonStyle: ReturnType<typeof normalizeButtonStyle>;
  destinations: PreviewDestination[];
}

export function normalizePaletteJson(palette: PreviewDraft["palette"]): string | null {
  if (!palette) return null;
  if (typeof palette === "string") return palette.trim() || null;
  return JSON.stringify(palette);
}

export function effectiveDraftMode(mode: LinkMode, releaseAt: string | null): LinkMode {
  if (mode !== "presave") return mode;
  if (!releaseAt) return "presave";
  return new Date(releaseAt) <= new Date() ? "live" : "presave";
}

export function resolvePreviewDraft(draft: PreviewDraft): ResolvedPreviewDraft {
  const mode = draft.mode ?? "live";
  const releaseAt = draft.releaseAt ?? null;
  const effectiveMode = effectiveDraftMode(mode, releaseAt);

  const destinations = Object.entries(draft.destinations ?? {})
    .map(([platform, url]) => {
      const trimmed = url?.trim() ?? "";
      if (!trimmed) return null;
      const label = platformLabels[platform as Platform] ?? platform;
      return {
        platform: platform as Platform,
        label,
        cta: presaveDestinationLabel(label, effectiveMode)
      };
    })
    .filter((row): row is PreviewDestination => row !== null)
    .sort((a, b) => {
      if (a.platform === "spotify") return -1;
      if (b.platform === "spotify") return 1;
      return 0;
    });

  return {
    title: draft.title?.trim() || "Track title",
    artistName: draft.artistName?.trim() || "Artist name",
    isrc: draft.isrc?.trim() || null,
    artworkUrl: draft.artworkUrl?.trim() || "/placeholder-artwork.svg",
    paletteJson: normalizePaletteJson(draft.palette),
    releaseAt,
    effectiveMode,
    pageBackgroundStyle: normalizePageBackgroundStyle(draft.pageBackgroundStyle),
    buttonStyle: normalizeButtonStyle(draft.buttonStyle),
    destinations
  };
}

export async function readPreviewDraft(request: Request): Promise<PreviewDraft> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return previewDraftSchema.parse(await request.json());
  }
  const form = await request.formData();
  const destinations: Partial<Record<Platform, string>> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("destinations.")) {
      destinations[key.replace("destinations.", "") as Platform] = String(value);
    }
  }
  return previewDraftSchema.parse({
    title: form.get("title"),
    artistName: form.get("artistName"),
    isrc: form.get("isrc"),
    artworkUrl: form.get("artworkUrl"),
    palette: form.get("palette"),
    releaseAt: form.get("releaseAt") || null,
    mode: form.get("mode"),
    pageBackgroundStyle: form.get("pageBackgroundStyle"),
    buttonStyle: form.get("buttonStyle"),
    destinations
  });
}
