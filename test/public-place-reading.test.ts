import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fetchPublicPlaceDetail } from "../src/lib/tutiApi";
import { preferencesStorage } from "../src/lib/storage/preferencesStorage";
import { requiresServiceTerms } from "../src/shared/legal/serviceTerms";
import { guardClientCompatibility } from "../src/server/appUpdate/clientGuard";
import { apiUrl } from "../src/lib/api/apiUrl";

test("공개 장소 상세는 세션 저장소를 읽거나 익명 계정을 생성하지 않고 인증 헤더 없이 요청한다", async t => {
  let calls = 0;
  t.mock.method(preferencesStorage, "getItem", async () => { throw Error("must not access account storage"); });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    calls++;
    assert.equal(String(input), apiUrl("public/places/place%2Fid/detail"));
    assert.equal(new Headers(init?.headers).has("Authorization"), false);
    assert.equal(init?.credentials, "omit");
    return Response.json({ place: { id: "place/id" }, detail: null });
  });
  assert.deepEqual(await fetchPublicPlaceDetail("place/id"), { place: { id: "place/id" }, detail: null });
  assert.equal(calls, 1);
});

test("공개 상세 GET만 기존 공개 API 정책으로 읽고 추천·내부 장소·작성의 동의 검사는 유지한다", () => {
  const path = "/api/public/places/place-id/detail";
  assert.equal(requiresServiceTerms(path, "GET"), false);
  assert.equal(guardClientCompatibility(new Request(`https://tuti.today${path}`)), null);
  for (const [path, method] of [["/api/places/place-id/detail", "GET"], ["/api/recommendations", "POST"],
    ["/api/journal-entries", "POST"], ["/api/harumadis/book/together", "POST"]]) {
    assert.equal(requiresServiceTerms(path, method), true, `${method} ${path}`);
  }
});

test("공개 페이지는 계정·위치·제품 계측 초기화 없이 읽고 사용 시작 시 동의 게이트로 이동한다", () => {
  const page = readFileSync("src/app/place/[placeId]/page.tsx", "utf8");
  const shell = readFileSync("src/features/tuti/components/PublicPlaceShell.tsx", "utf8");
  const flow = readFileSync("src/features/tuti/flows/PublicPlaceFlow.tsx", "utf8");
  const entry = readFileSync("src/features/tuti/flows/EntryFlow.tsx", "utf8");
  assert.match(page, /<PublicPlaceShell>/);
  assert.doesNotMatch(page, /TutiAppShell/);
  assert.doesNotMatch(shell, /import.*(?:Providers|SessionBootstrap|useSession|LocationAccessProvider|InitialServiceTermsGate|LifecycleObserver)/);
  assert.match(flow, /<DetailScreen\s+publicView/);
  assert.match(flow, /router.push\("\/entry\?next=explore"\)/);
  assert.match(entry, /params.get\("next"\) === "explore"/);
  assert.match(entry, /if \(continueToExplore\) \{\s+router.replace\("\/explore"\)/);
  assert.ok(entry.indexOf("if (continueToExplore)") < entry.indexOf("if (legacyExample)"));
  assert.doesNotMatch(entry, /router\.(?:push|replace)\(params.get\("next"\)/);
});

test("세션 없는 공개 상세 라우트도 추천 가능한 장소만 반환하고 없는 장소는 404로 처리한다", async () => {
  let found = true;
  (globalThis as { prisma?: unknown }).prisma = {
    place: { findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      assert.equal(where.id, "public-place");
      assert.ok(Object.keys(where).length > 1, "기존 추천 가능 장소 조건을 유지한다");
      return found ? { id: "public-place", name: "공유 장소", sourceAddress: null, sourceContentType: null,
        sourceSidoName: null, sourceSigunguName: null, suggestedAction: null, latitude: 37, longitude: 127 } : null;
    } },
    tourismPlaceSourceRecord: { findFirst: async () => null },
  };
  const { GET } = await import("../src/app/api/public/places/[placeId]/detail/route");
  const context = { params: Promise.resolve({ placeId: "public-place" }) };
  const response = await GET(new Request("https://tuti.today/api/public/places/public-place/detail"), context);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).place.name, "공유 장소");
  found = false;
  assert.equal((await GET(new Request("https://tuti.today/api/public/places/public-place/detail"), context)).status, 404);
});
