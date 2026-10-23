import { authenticateUser } from "@/server/auth/session";
import { acceptServiceTerms, getServiceTermsStatus, ServiceTermsError } from "@/server/legal/serviceTerms";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { CLIENT_PROTOCOL } from "@/shared/api/clientProtocol";
import { getLegalPolicyRelease } from "@/shared/legal/policyRelease";
import documents from "@/shared/legal/finalizedDocuments.json";

export const runtime = "nodejs";
function respond(request: Request, body: unknown, status = 200) {
  return withCors(request, Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }));
}

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) return respond(request, { error: "허용되지 않은 요청 출처예요." }, 403);
  try {
    const startedAt = performance.now();
    const entryOnly = new URL(request.url).searchParams.get("scope") === "entry";
    const user = await authenticateUser(request);
    const authenticatedAt = performance.now();
    const status = await getServiceTermsStatus(user?.id, new Date(), { currentOnly: entryOnly });
    const legalPolicyRelease = getLegalPolicyRelease();
    if (legalPolicyRelease && (status.current?.version !== legalPolicyRelease.version ||
        status.current.documentHash !== documents["service-terms"].documentHash)) throw new Error("약관 전환 원문을 확인해주세요.");
    // 동의 완료 계정의 진입 확인에는 원문을 다시 전송하지 않는다.
    const current = entryOnly && status.current?.accepted
      ? { version: status.current.version, documentHash: status.current.documentHash,
          publishedAt: status.current.publishedAt, effectiveAt: status.current.effectiveAt, accepted: true }
      : status.current;
    const response = respond(request, { ...status, current, clientProtocol: CLIENT_PROTOCOL, legalPolicyRelease });
    response.headers.set("Server-Timing", `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}, terms;dur=${(performance.now() - authenticatedAt).toFixed(1)}`);
    return response;
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
