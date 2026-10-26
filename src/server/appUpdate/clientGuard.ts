import { CLIENT_PLATFORM_HEADER, CLIENT_PROTOCOL, CLIENT_PROTOCOL_HEADER, CLIENT_VERSION_HEADER } from "@/shared/api/clientProtocol";
import { normalizeLegalPathname } from "@/shared/legal/serviceTerms";
import { withCors } from "@/server/http/cors";
import { compareAppVersions, createAppUpdatePolicy } from "./appUpdatePolicy";

const STORE_URLS = {
  android: "https://play.google.com/store/apps/details?id=com.noonmaru.tuti",
  ios: "https://apps.apple.com/kr/app/tuti/id6474651880",
};

// 규약 헤더는 호환성 판단이지 인증/연령/약관 동의 증명이 아니다. 각 통제를 별도로 유지한다.
export function guardClientCompatibility(request: Request, rightsRequest = false, env: Record<string, string | undefined> = process.env) {
  const rawPath = new URL(request.url).pathname;
  const path = normalizeLegalPathname(rawPath) ?? rawPath;
  const readRights = (request.method === "GET" || request.method === "HEAD") &&
    (path === "/api/account" || path === "/api/journal-entries" || path === "/api/journal-books" || path === "/api/journal-notebooks" || /^\/api\/journal-notebooks\/[^/]+(?:\/cover)?$/.test(path) ||
      /^\/api\/journal-entries\/[^/]+$/.test(path) || /^\/api\/journal-books\/[^/]+(?:\/file)?$/.test(path) ||
      /^\/api\/journal-entry-images\/[^/]+$/.test(path));
  const withdrawal = request.method === "DELETE" && (path === "/api/push/devices" || /^\/api\/journal-entries\/[^/]+\/sensitive-consent$/.test(path));
  if (request.method === "OPTIONS" || rightsRequest || readRights || withdrawal || path === "/api/health" || path === "/api/app-update" ||
      path === "/api/public" || path?.startsWith("/api/public/") || path?.startsWith("/api/admin/") ||
      path?.match(/^\/api\/auth\/oauth\/(google|apple|kakao)\/callback$/) ||
      (path !== "/api" && !path?.startsWith("/api/"))) return null;

  const rawPlatform = request.headers.get(CLIENT_PLATFORM_HEADER);
  const platform = rawPlatform === "android" || rawPlatform === "ios" || rawPlatform === "web" ? rawPlatform : null;
  const reject = (status = 426) => withCors(request, Response.json({
    code: status === 426 ? "client_update_required" : "client_update_policy_unavailable",
    error: status === 426 ? "새 버전으로 업데이트해주세요. 웹에서는 페이지를 새로고침해주세요." : "앱 지원 버전을 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
    platform, storeUrl: platform === "android" || platform === "ios" ? STORE_URLS[platform] : null,
  }, { status, headers: { "Cache-Control": "private, no-store" } }));
  if (request.headers.get(CLIENT_PROTOCOL_HEADER) !== CLIENT_PROTOCOL || !platform) return reject();
  if (platform === "android" || platform === "ios") {
    const version = request.headers.get(CLIENT_VERSION_HEADER);
    if (!version || !/^\d+(?:\.\d+){0,3}$/.test(version)) return reject();
    try {
      const policy = createAppUpdatePolicy(platform, version, env);
      // UI의 권장 안내와 무관하게 서버가 최소 버전을 독립적으로 집행한다.
      if (policy.minimumVersion && compareAppVersions(version, policy.minimumVersion) < 0) return reject();
    } catch { return reject(503); }
  }
  return null;
}
