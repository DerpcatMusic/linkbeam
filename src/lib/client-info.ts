export interface ClientInfo {
  deviceType: "mobile" | "tablet" | "desktop" | "unknown";
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  screenResolution: string;
  viewportSize: string;
  language: string;
  country: string;
  colo: string;
  region: string;
  city: string;
  asn: string;
  asOrganization: string;
  timezone: string;
  httpProtocol: string;
}

interface CfAnalyticsFields {
  country?: string;
  colo?: string;
  region?: string;
  city?: string;
  asn?: number;
  asOrganization?: string;
  timezone?: string;
  httpProtocol?: string;
}

export function clientInfoFromRequest(request: Request): ClientInfo {
  const url = new URL(request.url);
  const userAgent = request.headers.get("user-agent") ?? "";
  const cf = (request as Request & { cf?: CfAnalyticsFields }).cf;
  const browser = parseBrowser(userAgent);
  const os = parseOs(userAgent, cleanHint(request.headers.get("sec-ch-ua-platform")));

  return {
    deviceType: parseDeviceType(userAgent, request.headers.get("sec-ch-ua-mobile")),
    browserName: browser.name,
    browserVersion: browser.version,
    osName: os.name,
    osVersion: os.version,
    screenResolution: bounded(url.searchParams.get("sr"), 32),
    viewportSize: bounded(url.searchParams.get("vp"), 32),
    language: bounded(url.searchParams.get("lang") ?? firstLanguage(request.headers.get("accept-language")), 80),
    country: bounded(cf?.country ?? request.headers.get("cf-ipcountry"), 8),
    colo: bounded(cf?.colo, 16),
    region: bounded(cf?.region, 80),
    city: bounded(cf?.city, 80),
    asn: cf?.asn ? String(cf.asn) : "",
    asOrganization: bounded(cf?.asOrganization, 160),
    timezone: bounded(cf?.timezone, 80),
    httpProtocol: bounded(cf?.httpProtocol, 40)
  };
}

function parseDeviceType(userAgent: string, mobileHint: string | null): ClientInfo["deviceType"] {
  if (mobileHint === "?1") return "mobile";
  if (/iPad|Tablet/i.test(userAgent)) return "tablet";
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(userAgent)) return "mobile";
  if (mobileHint === "?0" || userAgent) return "desktop";
  return "unknown";
}

function parseBrowser(userAgent: string): { name: string; version: string } {
  const inApp = matchFirst(userAgent, [
    ["Instagram", /Instagram\s+([\d.]+)/i],
    ["Facebook", /\bFB(?:AN|AV)\/([\w.]+)/i],
    ["TikTok", /(?:TikTok|Musical_ly)[/\s]([\d.]+)/i]
  ]);
  if (inApp) return inApp;

  return matchFirst(userAgent, [
    ["Edge", /Edg(?:A|iOS)?\/([\d.]+)/i],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/i],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/i],
    ["Safari", /Version\/([\d.]+).*Safari/i]
  ]) ?? { name: userAgent ? "Other" : "", version: "" };
}

function parseOs(userAgent: string, platformHint: string): { name: string; version: string } {
  const iphone = userAgent.match(/(?:iPhone|iPad|iPod).*OS\s([\d_]+)/i);
  if (iphone) return { name: "iOS", version: iphone[1].replace(/_/g, ".") };
  const android = userAgent.match(/Android\s([\d.]+)/i);
  if (android) return { name: "Android", version: android[1] };
  const windows = userAgent.match(/Windows NT\s([\d.]+)/i);
  if (windows || platformHint === "Windows") return { name: "Windows", version: windows?.[1] ?? "" };
  const mac = userAgent.match(/Mac OS X\s([\d_]+)/i);
  if (mac || platformHint === "macOS") return { name: "macOS", version: mac?.[1]?.replace(/_/g, ".") ?? "" };
  if (platformHint) return { name: platformHint, version: "" };
  return { name: userAgent ? "Other" : "", version: "" };
}

function matchFirst(userAgent: string, patterns: Array<[string, RegExp]>): { name: string; version: string } | null {
  for (const [name, pattern] of patterns) {
    const match = userAgent.match(pattern);
    if (match) return { name, version: match[1] ?? "" };
  }
  return null;
}

function firstLanguage(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

function cleanHint(value: string | null): string {
  return (value ?? "").trim().replace(/^"|"$/g, "");
}

function bounded(value: string | null | undefined, maxLength: number): string {
  return value?.trim().slice(0, maxLength) ?? "";
}
