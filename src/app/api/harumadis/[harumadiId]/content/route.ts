import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest } from "@/server/harumadi/http";
import { readHarumadiContent } from "@/server/harumadi/content";
export const runtime = "nodejs";
type Context = { params: Promise<{ harumadiId: string }> };
export function GET(request: Request, context: Context) {
  return harumadiRequest(request, async owner => readHarumadiContent(owner, (await context.params).harumadiId));
}
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
