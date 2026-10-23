import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CLIENT_PLATFORM_HEADER, CLIENT_PROTOCOL, CLIENT_PROTOCOL_HEADER, CLIENT_VERSION_HEADER } from "@/shared/api/clientProtocol";
import { guardClientCompatibility } from "@/server/appUpdate/clientGuard";
import { createPreflightResponse } from "@/server/http/cors";
import { clientFetch } from "@/lib/api/clientFetch";
import { readStoredSession } from "@/lib/auth/session";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { apiUrl } from "@/lib/api/apiUrl";

const modern = { [CLIENT_PROTOCOL_HEADER]: CLIENT_PROTOCOL, [CLIENT_PLATFORM_HEADER]: "web" };
const request = (path: string, method = "GET", headers: Record<string, string> = {}) => new Request(`https://tuti.today${path}`, { method, headers });

test("규약 없는 구버전의 일반 API는 읽기/쓰기 모두 426으로 거절한다", async () => {
  for (const [path, method] of [["/api/anonymous-session", "POST"], ["/api/recommendations", "POST"], ["/api/places/place/detail", "GET"], ["/api/recommendation-regions", "GET"], ["/api/product-activity", "POST"], ["/api/journal-books", "POST"]]) {
    const response = guardClientCompatibility(request(path, method));
    assert.equal(response?.status, 426, path);
    assert.equal((await response!.json()).code, "client_update_required");
  }
  assert.equal(guardClientCompatibility(request("/api/recommendations", "POST", { ...modern, [CLIENT_PROTOCOL_HEADER]: "obsolete" }))?.status, 426);
  assert.equal(guardClientCompatibility(request("/api/recommendations", "POST", modern)), null);
  assert.equal(guardClientCompatibility(request("/api/%72ecommendations/", "POST"))?.status, 426);
});

test("네이티브는 버전 헤더가 필요하고 서버가 최소/최신 버전을 집행한다", () => {
  const native = { ...modern, [CLIENT_PLATFORM_HEADER]: "android", [CLIENT_VERSION_HEADER]: "1.3.1" };
  assert.equal(guardClientCompatibility(request("/api/recommendations", "POST", native), false, { APP_UPDATE_ANDROID_LATEST_VERSION: "1.4.0" })?.status, 426);
  assert.equal(guardClientCompatibility(request("/api/recommendations", "POST", { ...native, [CLIENT_VERSION_HEADER]: "1.4.0" }), false, { APP_UPDATE_ANDROID_LATEST_VERSION: "1.4.0" }), null);
  assert.equal(guardClientCompatibility(request("/api/recommendations", "POST", { ...native, [CLIENT_VERSION_HEADER]: "" }))?.status, 426);
  assert.equal(guardClientCompatibility(request("/api/recommendations", "POST", native), false, { APP_UPDATE_ANDROID_MINIMUM_VERSION: "bad" })?.status, 503);
});

test("권리 행사·공개 공유·콜백·운영/헬스·CORS는 호환 헤더 없이도 기존 통제로 넘긴다", () => {
  for (const path of ["/legal/privacy", "/api/health", "/api/app-update", "/api/admin/users", "/api/auth/oauth/google/callback", "/api/public/journal-entries/id", "/api/journal-books/book/file", "/api/journal-entries", "/api/account", "/api/journal-entry-images/id"]) {
    assert.equal(guardClientCompatibility(request(path)), null, path);
  }
  assert.equal(guardClientCompatibility(request("/api/push/devices", "DELETE")), null);
  assert.equal(guardClientCompatibility(request("/api/journal-entries/id/sensitive-consent", "DELETE")), null);
  assert.equal(guardClientCompatibility(request("/api/reports", "POST"), true), null);
  assert.equal(guardClientCompatibility(request("/api/recommendations", "OPTIONS")), null);
  const preflight = createPreflightResponse(request("/api/recommendations", "OPTIONS", { Origin: "https://localhost" }));
  for (const header of [CLIENT_PROTOCOL_HEADER, CLIENT_PLATFORM_HEADER, CLIENT_VERSION_HEADER]) assert.ok(preflight.headers.get("Access-Control-Allow-Headers")?.includes(header));
});

test("웹 API 요청은 인증·PDF 승인·취소 신호를 보존하고 새 규약을 붙인다", async t => {
  let inspected = false;
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get(CLIENT_PROTOCOL_HEADER), CLIENT_PROTOCOL);
    assert.equal(headers.get(CLIENT_PLATFORM_HEADER), "web");
    assert.equal(headers.get("Authorization"), "Bearer private-test");
    assert.equal(headers.get("X-Tuti-Journal-Book-Approval"), "test-approval");
    assert.equal(init?.signal, controller.signal);
    inspected = true;
    return Response.json({ ok: true });
  });
  await clientFetch(apiUrl("journal-books"), { method: "POST", headers: { Authorization: "Bearer private-test", "X-Tuti-Journal-Book-Approval": "test-approval" }, signal: controller.signal });
  assert.equal(inspected, true);
  await assert.rejects(clientFetch("https://external.invalid/photo.jpg"), /Tuti API/);
});

test("옛 호환 분기는 제거하고 버전·약관 병렬 확인을 모두 통과해야 부트스트랩한다", () => {
  assert.doesNotMatch(readFileSync("src/lib/auth/session.ts", "utf8"), /LEGACY_SESSION_STORAGE_KEY|tuti-anonymous-session|legacyOnly/);
  assert.doesNotMatch(readFileSync("src/server/journal/bookApproval.ts", "utf8"), /legacy-json|JOURNAL_BOOK_MAX_JSON_BYTES/);
  assert.doesNotMatch(readFileSync("src/app/api/journal-books/route.ts", "utf8"), /prepareLegacyJournalBook|renderOwnedJournalBook/);
  const shell = readFileSync("src/features/tuti/components/TutiAppShell.tsx", "utf8");
  assert.match(shell, /<InitialServiceTermsGate renderContent=\{content => <NativeAppUpdateNotice>\{content\}<\/NativeAppUpdateNotice>\}/);
  assert.ok(shell.indexOf("<NativeAppUpdateNotice>") < shell.indexOf("<Providers"));
  const gate = readFileSync("src/features/legal/InitialServiceTermsGate.tsx", "utf8");
  assert.match(gate, /void loadInitialServiceTerms\(\)/);
  assert.match(gate, /state\?\.allowed\) return renderContent\(children\)/);
  assert.match(gate, /return renderContent\(\s*<Screen/);
  const notice = readFileSync("src/features/tuti/components/NativeAppUpdateNotice.tsx", "utf8");
  assert.match(notice, /incompatible \|\| checkFailed \|\| !checked/);
  assert.match(notice, /!policy.required && children/);
  assert.match(notice, /setCheckFailed\(true\)/);
  const recorded = JSON.parse(readFileSync("docs/legal/readiness-status.json", "utf8"));
  assert.equal(recorded.clientCompatibilityCutover.accountDeletionApplied, false);
  assert.equal(recorded.clientCompatibilityCutover.deploymentApplied, false);
  assert.equal(recorded.clientCompatibilityCutover.headersProveAuthenticityOrConsent, false);
});

test("옛 저장소에만 세션이 남아 있어도 신규 클라이언트에서 자동 이관하지 않는다", async t => {
  const keys: string[] = [];
  t.mock.method(preferencesStorage, "getItem", async (key: string) => {
    keys.push(key);
    return key === "tuti-anonymous-session" ? JSON.stringify({ userId: "old", accessToken: "x".repeat(40) }) : null;
  });
  assert.equal(await readStoredSession(), null);
  assert.deepEqual(keys, ["tuti-session"]);
});
