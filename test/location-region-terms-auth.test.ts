import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { getSessionSnapshot } from "@/lib/auth/session";
import { fetchRecommendationRegions, fetchPlaceDetail, fetchNearbyAccommodations, fetchDepartureNearbyPlaces, updateLocationConsent } from "@/lib/tutiApi";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.SERVICE_TERMS_WORKFLOW_ENABLED = "true";
process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED = "true";
const document = { title: "이용약관", summary: "서비스 이용 안내", importantTerms: ["별도 위치 동의는 선택입니다."], sections: [{ title: "이용", paragraphs: ["위치 없이 지역을 선택할 수 있습니다."] }] };
let accepted = true;
let documentHash = "";
(globalThis as { prisma?: unknown }).prisma = {
  user: { findUnique: async () => ({ id: "region-user", role: "user", lastAccessedAt: new Date(), authIdentities: [] }) },
  serviceTermsRelease: { findFirst: async ({ where }: { where: { effectiveAt: { lte?: Date } } }) => where.effectiveAt.lte ? { version: "2026-10-22", document, documentHash, publishedAt: new Date("2026-10-22"), effectiveAt: new Date("2026-10-22") } : null },
  serviceTermsAcceptance: { findMany: async () => accepted ? [{ termsVersion: "2026-10-22", documentHash, ageConfirmed: true, importantTermsConfirmed: true }] : [] },
};
const { hashServiceTerms } = await import("@/server/legal/serviceTerms");
const { guardServiceTerms } = await import("@/server/legal/requestGuard");
documentHash = hashServiceTerms(document);

test("위치약관을 거절해도 일반약관에 동의한 같은 세션으로 지역·장소를 조회한다", async t => {
  const session = { userId: "region-user", accessToken: "r".repeat(40) };
  t.mock.method(preferencesStorage, "getItem", async (key: string) => key === "tuti-session" ? JSON.stringify(session) : null);
  t.mock.method(preferencesStorage, "setItem", async () => {});
  const requests: string[] = [];
  let declined = false;
  const regions = [{ areaCode: "1", name: "서울특별시", shortName: "서울", districts: [{ code: "23", name: "종로구", candidateCount: 1 }] }];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), "https://tuti.today");
    requests.push(url.pathname);
    // 이 테스트에서는 새 익명 계정 생성이나 위치 재동의를 허용하지 않는다.
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${session.accessToken}`);
    assert.equal(url.pathname === "/api/anonymous-session", false);
    const blocked = await guardServiceTerms(new Request(url, init));
    if (blocked) return blocked;
    if (url.pathname === "/api/location-consent") {
      assert.equal(JSON.parse(String(init?.body)).status, "declined");
      declined = true;
      return Response.json({ consent: { status: "declined" } });
    }
    assert.equal(declined, true);
    if (url.pathname === "/api/recommendation-regions") return Response.json({ regions });
    if (url.pathname.endsWith("/detail")) return Response.json({ place: { id: "place/id" } });
    if (url.pathname.endsWith("/accommodations")) return Response.json({ accommodations: [] });
    if (url.pathname.endsWith("/departure-nearby")) return Response.json({ nearbyPlaces: [] });
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  const unauthenticated = await guardServiceTerms(new Request("https://tuti.today/api/recommendation-regions"));
  assert.equal(unauthenticated?.status, 401);
  await updateLocationConsent("declined");
  assert.deepEqual(await fetchRecommendationRegions(), { regions });
  assert.deepEqual(await fetchPlaceDetail("place/id"), { place: { id: "place/id" } });
  assert.deepEqual(await fetchNearbyAccommodations("place/id"), { accommodations: [] });
  assert.deepEqual(await fetchDepartureNearbyPlaces("place/id"), []);
  assert.equal(requests.length, 5);
  assert.equal(getSessionSnapshot()?.userId, session.userId);
  accepted = false;
  try {
    await assert.rejects(fetchRecommendationRegions(), /이용약관/);
    const blocked = await guardServiceTerms(new Request("https://tuti.today/api/recommendation-regions", { headers: { Authorization: `Bearer ${session.accessToken}` } }));
    assert.equal(blocked?.status, 428);
  } finally { accepted = true; }
});

test("마디 장소 검색도 공개 요청 대신 세션이 포함된 요청을 사용한다", () => {
  const source = readFileSync("src/features/tuti/components/JournalPlacePicker.tsx", "utf8");
  assert.match(source, /fetchWithSession\(\s*`places\/search\?q=/);
  assert.match(source, /signal: controller.signal/);
  assert.doesNotMatch(source, /clientFetch|apiUrl/);
});
