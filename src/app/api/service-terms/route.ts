import { authenticateUser } from "@/server/auth/session";
import { acceptServiceTerms, getServiceTermsStatus, ServiceTermsError } from "@/server/legal/serviceTerms";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { CLIENT_PROTOCOL } from "@/shared/api/clientProtocol";

export const runtime = "nodejs";
function respond(request: Request, body: unknown, status = 200) {
  return withCors(request, Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }));
}

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return respond(request, { error: "허용되지 않은 요청 출처예요." }, 403);
  try {
    const user = await authenticateUser(request);
    return respond(request, { ...await getServiceTermsStatus(user?.id), clientProtocol: CLIENT_PROTOCOL });
  } catch {
    return respond(request, { error: "이용약관을 불러오지 못했어요. 잠시 후 다시 시도해주세요." }, 503);
  }
}

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) return respond(request, { error: "허용되지 않은 요청 출처예요." }, 403);
  try {
    const user = await authenticateUser(request);
    if (!user) return respond(request, { error: "현재 계정에서 다시 로그인해주세요." }, 401);
    const receipt = await acceptServiceTerms(user.id, await request.json());
    return respond(request, { receipt: { ...receipt, acceptedAt: receipt.acceptedAt.toISOString() } });
  } catch (error) {
    return respond(request, { error: error instanceof ServiceTermsError ? error.message : "동의를 저장하지 못했어요. 다시 시도해주세요." }, error instanceof ServiceTermsError ? error.status : error instanceof SyntaxError ? 400 : 503);
  }
}

export function OPTIONS(request: Request) { return createPreflightResponse(request); }
