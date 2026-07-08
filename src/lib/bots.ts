const BOT_UA_PATTERNS = [
  /facebookexternalhit/i,
  /whatsapp/i,
  /discordbot/i,
  /twitterbot/i,
  /slackbot/i,
  /\bcurl\b/i,
  /headless/i,
  /\bbot\b/i,
  /spider/i,
  /crawler/i
];

const BOT_VERDICTS = new Set(["automated", "likely_automated", "verified_bot"]);

export function isBot(request: Request): boolean {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  const verdict = (cf?.botManagement as { verdict?: string } | undefined)?.verdict;
  if (verdict && BOT_VERDICTS.has(verdict)) return true;

  const ua = request.headers.get("user-agent") ?? "";
  return BOT_UA_PATTERNS.some((pattern) => pattern.test(ua));
}
