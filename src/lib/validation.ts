import { z } from "zod";
import { BUTTON_STYLES, PAGE_BACKGROUND_STYLES } from "@lib/page-style";
import { platformLabels } from "@lib/types";

const isrcPattern = /^[A-Za-z]{2}[A-Za-z0-9]{3}\d{7}$/;

export const importInputSchema = z
  .string()
  .min(1)
  .refine((value) => {
    const trimmed = value.trim();
    if (isrcPattern.test(trimmed.replace(/[^A-Za-z0-9]/g, ""))) return true;
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }, "Import input must be a URL or ISRC.");

export const importBodySchema = z.object({
  trackId: z.string().optional(),
  importInput: importInputSchema.optional(),
  sourceUrl: importInputSchema.optional(),
  isrc: z.string().optional(),
  title: z.string().optional(),
  artistName: z.string().optional(),
  artistNames: z.array(z.string()).optional(),
  artworkUrl: z.url().optional(),
  releaseAt: z.string().optional()
}).refine((data) => Boolean(data.importInput || data.sourceUrl), {
  message: "Import input is required.",
  path: ["importInput"]
});

export const destinationsSchema = z.object(
  Object.fromEntries(Object.keys(platformLabels).map((key) => [key, z.url().or(z.literal("")).optional()]))
);

export const linkBodySchema = z.object({
  linkName: z.string().min(1),
  slug: z.string().min(1),
  trackId: z.string().min(1),
  mode: z.enum(["presave", "live"]),
  destinations: destinationsSchema,
  viewEventName: z.string().min(1).optional(),
  clickEventName: z.string().min(1).nullable().optional(),
  paidClickEventName: z.string().min(1).optional(),
  spotifyOpenBehavior: z.enum(["web", "playlist_context", "app_first"]).optional(),
  spotifyContextUrl: z.url().or(z.literal("")).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  releaseAt: z.string().nullable().optional(),
  pageBackgroundStyle: z.enum(PAGE_BACKGROUND_STYLES).optional(),
  buttonStyle: z.enum(BUTTON_STYLES).optional(),
  pageStyleOptions: z.record(z.string(), z.unknown()).optional()
});

export const subscribeBodySchema = z.object({
  linkId: z.string().min(1),
  email: z.email(),
  website: z.string().optional()
});

export const settingsBodySchema = z.object({
  metaPixelId: z.string().optional(),
  metaApiVersion: z.string().regex(/^v\d+\.\d+$/, "Meta API version must look like v23.0.").or(z.literal("")).optional(),
  metaTestEventCode: z.string().optional(),
  metaAdAccountId: z.string().optional()
}).strict();

const onboardingStepIds = [
  "welcome",
  "resources",
  "secrets",
  "database",
  "auth",
  "first-link",
  "pixel",
  "complete"
] as const;

export const onboardingBodySchema = z.object({
  step: z.enum(onboardingStepIds).optional(),
  completed: z.boolean().optional(),
  skipStep: z.enum(onboardingStepIds).optional(),
  skipWizard: z.boolean().optional()
});
