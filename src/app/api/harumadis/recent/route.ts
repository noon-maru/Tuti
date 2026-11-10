import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest } from "@/server/harumadi/http";
import { listRecentHarumadis } from "@/server/harumadi/service";

export const runtime = "nodejs";
export function GET(request: Request) { return harumadiRequest(request, userId => listRecentHarumadis(userId)); }
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
