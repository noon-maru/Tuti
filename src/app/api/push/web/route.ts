import { authenticateUser } from "@/server/auth/session";
import { webPushConfiguration } from "@/server/notifications/webPush";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return new Response(null, { status: 403 });
  if (!await authenticateUser(request)) return withCors(request, new Response(null, { status: 401 }));
  const config = webPushConfiguration();
  return withCors(request, Response.json({ enabled: Boolean(config), publicKey: config?.publicKey ?? null }, { headers: { "Cache-Control": "no-store" } }));
}
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
