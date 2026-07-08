interface JwksKey {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

interface JwksResponse {
  keys: JwksKey[];
}

let jwksCache: { teamDomain: string; keys: JwksKey[]; expiresAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

export function getAccessJwt(request: Request): string | undefined {
  const header = request.headers.get("cf-access-jwt-assertion");
  if (header) return header;
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  return cookies.CF_Authorization;
}

export async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  let header: { kid?: string; alg?: string };
  let payload: { aud?: string | string[]; exp?: number; iss?: string };
  try {
    header = JSON.parse(base64UrlDecode(parts[0])) as { kid?: string; alg?: string };
    payload = JSON.parse(base64UrlDecode(parts[1])) as { aud?: string | string[]; exp?: number; iss?: string };
  } catch {
    return false;
  }

  if (header.alg && header.alg !== "RS256") return false;
  if (!payload.exp) return false;
  if (payload.exp < Math.floor(Date.now() / 1000)) return false;

  const expectedIss = `https://${teamDomain}.cloudflareaccess.com`;
  if (payload.iss !== expectedIss) return false;

  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(aud)) return false;

  const keys = await fetchJwks(teamDomain);
  const key = keys.find((item) => item.kid === header.kid);
  if (!key) return false;

  return verifyRs256(`${parts[0]}.${parts[1]}`, parts[2], key);
}

async function fetchJwks(teamDomain: string): Promise<JwksKey[]> {
  const now = Date.now();
  if (jwksCache && jwksCache.teamDomain === teamDomain && jwksCache.expiresAt > now) {
    return jwksCache.keys;
  }

  const response = await fetch(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`JWKS fetch failed: ${response.status}`);
  const data = (await response.json()) as JwksResponse;
  jwksCache = { teamDomain, keys: data.keys ?? [], expiresAt: now + JWKS_TTL_MS };
  return jwksCache.keys;
}

async function verifyRs256(signed: string, signature: string, jwk: JwksKey): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signatureBytes = base64UrlToBytes(signature) as Uint8Array<ArrayBuffer>;
  const data = new TextEncoder().encode(signed);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signatureBytes, data);
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return atob(padded);
}

function base64UrlToBytes(value: string): Uint8Array {
  const decoded = base64UrlDecode(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function parseCookies(header: string): Record<string, string> {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...value] = part.split("=");
        return [decodeURIComponent(key), decodeURIComponent(value.join("="))];
      })
  );
}

export function clearJwksCacheForTests(): void {
  jwksCache = null;
}
