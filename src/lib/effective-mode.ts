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

export function resolveLearningClickEventName(link: SmartLink): string | null {
  const eventName = link.learning_click_event_name;
  return eventName && eventName !== resolveClickEventName(link) ? eventName : null;
}

export function resolveOutboundMetaEvents(link: SmartLink, primaryEventId: string): Array<{ eventName: string; eventId: string }> {
  const events = [{ eventName: resolveClickEventName(link), eventId: primaryEventId }];
  const learningEventName = resolveLearningClickEventName(link);
  if (learningEventName) events.push({ eventName: learningEventName, eventId: `${primaryEventId}_stream` });
  return events;
}

export function preReleaseDestinationLabel(platformLabel: string, mode: LinkMode): string {
  return mode === "presave" ? `Open on ${platformLabel}` : platformLabel;
}

export function daysUntilRelease(releaseAt: string | null): number | null {
  if (!releaseAt) return null;
  const diff = new Date(releaseAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
