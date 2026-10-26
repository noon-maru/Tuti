import { authenticateUser } from "@/server/auth/session";
import { withCors } from "@/server/http/cors";
import { getServiceTermsStatus, serviceTermsEnforcementEnabled } from "@/server/legal/serviceTerms";
import { normalizeLegalPathname, requiresServiceTerms } from "@/shared/legal/serviceTerms";

export async function guardServiceTerms(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!serviceTermsEnforcementEnabled() || !requiresServiceTerms(path, request.method)) return null;
  // 공개 중지는 일반 이용약관 미동의 상태에서도 가능하다.
  if (await isJournalUnpublishRequest(request)) return null;
  const respond = (body: unknown, status: number) => withCors(request, Response.json(body, {
    status, headers: { "Cache-Control": "private, no-store" },
  }));
  try {
    const user = await authenticateUser(request);
    if (!user) return respond({ error: "이용약관을 확인한 뒤 시작해주세요.", code: "service_terms_session_required" }, 401);
    const state = await getServiceTermsStatus(user.id);
    // 시행 중인 문서가 없거나 조회가 실패하면 일반 이용을 허용하지 않는다.
    if (!state.current) return respond({ error: "시행 중인 이용약관을 확인하지 못했어요.", code: "service_terms_unavailable" }, 503);
    if (state.current.accepted) return null;
    return respond({ error: "새로운 이용을 이어가기 전에 이용약관을 확인해주세요. 안내가 보이지 않는 앱은 업데이트해주세요. 기존 기록 열람·삭제와 문의는 계속 가능해요.", code: "service_terms_required", version: state.current?.version, termsUrl: "https://tuti.today/legal/service-terms" }, 428);
  } catch {
    return respond({ error: "이용약관 동의 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.", code: "service_terms_unavailable" }, 503);
  }
}

export function isLegalRightsPath(pathname: string, method?: string) {
  const normalized = normalizeLegalPathname(pathname);
  if (normalized === null) return false;
  pathname = normalized;
  if (method === "DELETE" && (pathname === "/api/account" || /^\/api\/(journal-entries|harumadi-pdfs|harumadis)\/[^/]+$/.test(pathname))) return true;
  return pathname === "/legal" || pathname.startsWith("/legal/") || pathname === "/api/public/legal-notices" || pathname === "/account-deletion" ||
    pathname === "/api/account-deletion-requests" || pathname === "/api/location-consent" ||
    pathname === "/api/location-history" || pathname === "/api/service-terms" || pathname === "/api/inquiries" ||
    pathname === "/api/reports" || pathname === "/api/journal-author-blocks";
}

async function isJournalUnpublishRequest(request: Request) {
  const path = normalizeLegalPathname(new URL(request.url).pathname);
  if (path === null || request.method !== "PATCH" || !/^\/api\/journal-entries\/[^/]+\/publication$/.test(path)) return false;
  const body = await request.clone().json().catch(() => null);
  return body?.published === false;
}

export async function isLegalRightsRequest(request: Request) {
  return isLegalRightsPath(new URL(request.url).pathname, request.method) || await isJournalUnpublishRequest(request);
}
