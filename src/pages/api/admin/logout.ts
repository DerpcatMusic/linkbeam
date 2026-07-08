import type { APIRoute } from "astro";
import { clearAdminSessionCookie } from "@lib/admin-session";

export const POST: APIRoute = async () => new Response(null, {
  status: 303,
  headers: {
    "Location": "/admin/login",
    "Set-Cookie": clearAdminSessionCookie()
  }
});
