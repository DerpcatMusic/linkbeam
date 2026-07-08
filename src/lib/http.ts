export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function readJson<T>(request: Request): Promise<T> {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new Response("Expected JSON", { status: 415 });
  }
  return request.json() as Promise<T>;
}

export function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

export function notFound(): Response {
  return new Response("Not found", { status: 404 });
}
