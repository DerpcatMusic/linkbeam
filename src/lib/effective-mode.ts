import type { LinkMode, SmartLink } from "@lib/types";

export function effectiveLinkMode(link: SmartLink): LinkMode {
  if (link.mode !== "presave") return link.mode;
  if (!link.track.release_at) return "presave";
  return new Date(link.track.release_at) <= new Date() ? "live" : "presave";
}

export function resolveViewEventName(link: SmartLink): string {
  return link.view_event_name || "ViewContent";
}

export function resolveClickEventName(link: SmartLink): string {
  if (link.click_event_name) return link.click_event_name;
  return effectiveLinkMode(link) === "presave" ? "Lead" : "ViewContent";
}

export function resolvePaidClickEventName(link: SmartLink): string {
  return link.paid_click_event_name || "Stream_Click_Paid";
}

export function presaveDestinationLabel(platformLabel: string, mode: LinkMode): string {
  if (mode !== "presave") return platformLabel;
  if (platformLabel === "Spotify") return "Pre-save on Spotify";
  if (platformLabel === "Apple Music") return "Pre-save on Apple Music";
  return `Pre-save on ${platformLabel}`;
}

export function daysUntilRelease(releaseAt: string | null): number | null {
  if (!releaseAt) return null;
  const diff = new Date(releaseAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
