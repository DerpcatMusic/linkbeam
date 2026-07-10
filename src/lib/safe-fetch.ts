export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs: number;
  accept?: RegExp;
  allowedHosts?: readonly string[];
  init?: RequestInit;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export function validateRemoteUrl(input: string, allowedHosts?: readonly string[]): URL {
  const url = new URL(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const allowed = !allowedHosts || allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  if (
    !["http:", "https:"].includes(url.protocol)
    || Boolean(url.username || url.password)
    || !allowed
    || isPrivateHost(hostname)
  ) {
    throw new Error("Remote URL must use public HTTP or HTTPS.");
  }
  return url;
}

export async function safeFetchText(
  input: string,
  options: SafeFetchOptions
): Promise<{ text: string; response: Response }> {
  const response = await safeFetchResponse(input, {
    ...options,
    accept: options.accept ?? /^(text\/html|application\/xhtml\+xml)/i
  });
  return { text: await response.text(), response };
}

export async function safeFetchStream(input: string, options: SafeFetchOptions): Promise<Response> {
  return safeFetchResponse(input, options);
}

export async function safeFetchResponse(input: string, options: SafeFetchOptions): Promise<Response> {
  let url = validateRemoteUrl(input, options.allowedHosts);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, {
      ...options.init,
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs)
    });
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Remote URL redirected too many times.");
      url = validateRemoteUrl(new URL(location, url).toString(), options.allowedHosts);
      continue;
    }
    assertContentType(response, options.accept);
    const bytes = await readBoundedBody(response, options.maxBytes);
    const body = new Uint8Array(bytes).buffer as ArrayBuffer;
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }
  throw new Error("Remote URL redirected too many times.");
}

function assertContentType(response: Response, accept?: RegExp): void {
  if (!accept) return;
  const contentType = response.headers.get("content-type") ?? "";
  if (!accept.test(contentType)) throw new Error(`Unexpected remote content type: ${contentType || "missing"}.`);
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`Remote response is too large (limit ${maxBytes} bytes).`);
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Remote response is too large (limit ${maxBytes} bytes).`);
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function isPrivateHost(hostname: string): boolean {
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname === "metadata.google.internal"
    || hostname === "instance-data"
  ) return true;

  if (hostname.includes(":")) {
    const normalized = hostname.toLowerCase();
    return normalized === "::1"
      || normalized === "::"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe8")
      || normalized.startsWith("fe9")
      || normalized.startsWith("fea")
      || normalized.startsWith("feb");
  }

  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const parts = hostname.split(".").map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b! >= 64 && b! <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b! >= 16 && b! <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19))
    || a! >= 224;
}
