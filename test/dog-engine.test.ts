import assert from "node:assert/strict";
import test from "node:test";

const rows = Array.from({ length: 181 }, (_, i) => ({ id: `dog-${i}`, name: `동반 공원 ${i}`, image: "", sourceContentType: "12", sourceSidoName: "서울특별시", sourceSigunguName: "강남구", latitude: i === 180 ? 37.52 : 37.5 + i * 0.00001, longitude: 127, experienceType: "forest_garden", visitTimeProfile: null, tourismSourceRecord: null }));
let query: unknown;
(globalThis as { prisma?: unknown }).prisma = {
  dogPlaceCatalog: { count: async () => rows.length },
  place: { findMany: async (arg: unknown) => { query = arg; return rows; } },
  dogPlaceAccess: { findMany: async () => [] },
  tourismPetSourceRecord: { findMany: async () => rows.map((row, i) => ({ placeId: row.id, fetchedAt: new Date(Date.now() - 1000), rawPayload: { contentid: String(i), acmpyTypeCd: "전구역 동반가능", acmpyPsblCpam: i === 180 ? "전 견종 동반 가능" : "10kg 이하 동반 가능" } })) },
};
const { createDogRecommendations } = await import("../src/server/recommendations/dogEngine");
test("동반하지 않을 때는 동반 제한을 적용하지 않고 일반 장소 안내를 사용한다", async () => {
  const result = await createDogRecommendations({ answers: { movement: "near", transport: "transit", petCompanion: "none" }, location: { latitude: 37.5, longitude: 127 }, dogOuting: { weightsKg: [15], leash: false, carrier: false } });
  assert.equal(result.audit.companionEligible, 181);
  assert.ok(result.places.every(place => !place.dogAccess && !place.reason?.includes("반려견")));
});
test("일반 180곳 절단 없이 동반 조건부터 판정하고 최초 추천은 외부 API를 기다리지 않는다", async t => {
  let network = false;
  t.mock.method(globalThis, "fetch", async () => { network = true; throw Error("network forbidden"); });
  const result = await createDogRecommendations({ answers: { petCompanion: "dog", movement: "short", transport: "transit" }, location: { latitude: 37.5, longitude: 127 }, dogOuting: { weightsKg: [15], leash: true, carrier: false } });
  assert.equal(result.places.length, 1); assert.equal(result.places[0].id, "dog-180");
  assert.equal(network, false); assert.equal("take" in (query as object), false);
  assert.doesNotMatch(JSON.stringify(query), /candidateStatus|reviewStatus|fatigue/);
  assert.equal(result.audit.areaCandidates, 181); assert.equal(result.audit.companionEligible, 1);
  assert.equal(result.personalization.mode, "off");
});
test("조건 미입력은 준비물을 미지참했다고 추정하지 않으며 새 엔진만 실행한다", async () => {
  const result = await createDogRecommendations({ answers: { petCompanion: "dog", movement: "short", transport: "transit" }, location: { latitude: 37.5, longitude: 127 } });
  assert.equal(result.places.length, 6); assert.equal(result.audit.companionEligible, 181);
  assert.equal(result.audit.algorithmVersion, "dog-outing-v2"); assert.equal(result.audit.conditionsProvided, false);
  assert.ok(result.places.every(p => p.dogAccess?.kind === "tourapi"));
});

test("구 저장값의 동반 답변 누락은 화면·검색과 동일하게 일반 나들이로 처리한다", async () => {
  const result = await createDogRecommendations({ answers: { movement: "near", transport: "transit" }, location: { latitude: 37.5, longitude: 127 },
    dogOuting: { weightsKg: [30], leash: false, carrier: false, space: "indoor" } });
  assert.equal(result.audit.companionEligible, 181);
  assert.equal(result.audit.conditionsProvided, false);
  assert.ok(result.places.every(place => !place.dogAccess && !place.reason?.includes("반려견")));
  assert.match(JSON.stringify(query), /"OR"/);
});

test("명시적 카테고리 선택은 이전 세부 조건의 목적·카테고리보다 우선하며 다른 유형으로 채우지 않는다", async () => {
  const result = await createDogRecommendations({ answers: { petCompanion: "dog", movement: "short", transport: "transit", placeCategories: ["cafe"] },
    location: { latitude: 37.5, longitude: 127 }, dogOuting: { weightsKg: [], leash: null, carrier: null, purpose: "walk", categories: ["park"] } });
  assert.ok(result.audit.companionEligible > 0);
  assert.equal(result.places.length, 0, "카페 후보가 없을 때 공원으로 조용히 대체하지 않는다");
});

test("이전 클라이언트의 명시적 동반 한 시간 요청도 서버에서 한두 시간 범위로 계산한다", async () => {
  const location = { latitude: 37.5, longitude: 127 };
  const old = await createDogRecommendations({ answers: { petCompanion: "dog", movement: "near", transport: "transit" }, location });
  const oldQuery = structuredClone(query);
  const current = await createDogRecommendations({ answers: { petCompanion: "dog", movement: "short", transport: "transit" }, location });
  assert.deepEqual(oldQuery, query);
  assert.deepEqual(old.audit, current.audit);
  assert.deepEqual(old.places.map(place => place.id), current.places.map(place => place.id));
  const where = (query as { where: { AND: Array<{ latitude?: { gte: number } }> } }).where;
  assert.ok(where.AND.some(condition => condition.latitude?.gte === location.latitude - 20_000 / 110_000));
});
