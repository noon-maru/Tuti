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
test("일반 180곳 절단 없이 동반 조건부터 판정하고 최초 추천은 외부 API를 기다리지 않는다", async t => {
  let network = false;
  t.mock.method(globalThis, "fetch", async () => { network = true; throw Error("network forbidden"); });
  const result = await createDogRecommendations({ answers: { movement: "near", transport: "transit" }, location: { latitude: 37.5, longitude: 127 }, dogOuting: { weightsKg: [15], leash: true, carrier: false } });
  assert.equal(result.places.length, 1); assert.equal(result.places[0].id, "dog-180");
  assert.equal(network, false); assert.equal("take" in (query as object), false);
  assert.doesNotMatch(JSON.stringify(query), /candidateStatus|reviewStatus|fatigue/);
  assert.equal(result.audit.areaCandidates, 181); assert.equal(result.audit.companionEligible, 1);
  assert.equal(result.personalization.mode, "off");
});
test("조건 미입력은 준비물을 미지참했다고 추정하지 않으며 새 엔진만 실행한다", async () => {
  const result = await createDogRecommendations({ answers: { movement: "near", transport: "transit" }, location: { latitude: 37.5, longitude: 127 } });
  assert.equal(result.places.length, 6); assert.equal(result.audit.companionEligible, 181);
  assert.equal(result.audit.algorithmVersion, "dog-outing-v1"); assert.equal(result.audit.conditionsProvided, false);
  assert.ok(result.places.every(p => p.dogAccess?.kind === "tourapi"));
});
