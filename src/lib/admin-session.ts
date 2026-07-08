const COOKIE_NAME = "ms_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type AdminSessionEnv = {
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_SESSION_SECRET?: string;
};

export function passwordAuthConfigured(env: AdminSessionEnv): boolean {
  return Boolean(env.ADMIN_PASSWORD_HASH && env.ADMIN_SESSION_SECRET);
}

export async function verifyAdminPassword(password: string, env: AdminSessionEnv): Promise<boolean> {
  if (!env.ADMIN_PASSWORD_HASH) return false;
  const candidate = await sha256Hex(password);
  return constantTimeEqual(candidate, env.ADMIN_PASSWORD_HASH.trim().toLowerCase());
}

export async function createAdminSessionCookie(env: AdminSessionEnv): Promise<string> {
  if (!env.ADMIN_SESSION_SECRET) throw new Error("ADMIN_SESSION_SECRET is not configured");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const signature = await sign(`${expiresAt}`, env.ADMIN_SESSION_SECRET);
  const value = encodeURIComponent(`${expiresAt}.${signature}`);
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearAdminSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function verifyAdminSession(request: Request, env: AdminSessionEnv): Promise<boolean> {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const cookie = parseCookies(request.headers.get("cookie") ?? "")[COOKIE_NAME];
  if (!cookie) return false;

  const [expiresAtRaw, signature] = cookie.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || !signature) return false;
  if (expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expected = await sign(`${expiresAt}`, env.ADMIN_SESSION_SECRET);
  return constantTimeEqual(signature, expected);
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(signature));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let diff = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return diff === 0;
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
