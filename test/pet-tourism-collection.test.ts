import assert from "node:assert/strict";
import test from "node:test";
import { collectPetTourism } from "../src/server/tourism/collectPetTourism";
import { petReviewHints, petTourRecord, type PetTourRecord } from "../src/server/tourism/petTourRecord";
import { fetchPetTourPage } from "../src/server/tourism/petTourClient";
import { TourApiError } from "../src/server/tourism/tourApiClient";

const page = (items: Record<string, unknown>[], totalCount = items.length, pageNo = 1) => ({ items, totalCount, pageNo, numOfRows: items.length });
test("국문 목록은 원문 그대로 수집하고 완결한 페이지에서만 체크포인트를 남긴다", async () => {
  const saved: PetTourRecord[][] = [];
  const result = await collectPetTourism({ source: "kor", startPage: 1, pages: 3, rows: 1, maxRequests: 3 }, async records => { saved.push(records); }, async (_source, n) => page([{ contentid: String(n), acmpyNeedMtr: "" }], 2, n));
  assert.equal(result.received, 2); assert.equal(result.complete, true); assert.equal(result.nextPage, 3);
  assert.equal(saved[0][0].facilityVerifiedAt, null);
  assert.equal(petReviewHints(saved[0][0].rawPayload).requirements, null);
  assert.equal("allowed" in saved[0][0], false);
});
test("전용 서비스는 목록 후 콘텐츠별 상세를 수집하며 출처를 분리한다", async () => {
  const calls: (string | undefined)[] = [], records: PetTourRecord[] = [];
  const result = await collectPetTourism({ source: "pet", startPage: 1, pages: 1, rows: 2, maxRequests: 3 }, async rows => { records.push(...rows); }, async (_s, _n, _r, id) => {
    calls.push(id); return id ? page([{ contentid: id, acmpyNeedMtr: "목줄 착용" }]) : page([{ contentid: "1", title: "공개 장소" }, { contentid: "2" }]);
  });
  assert.deepEqual(calls, [undefined, "1", "2"]); assert.equal(result.requests, 3);
  assert.equal(records[0].listPayload?.title, "공개 장소");
  assert.notEqual(records[0].sourceUrl, petTourRecord("kor", { contentid: "1" }, new Date()).sourceUrl);
});
test("요청 예산이 부족하면 반쪽 페이지를 수집하지 않는다", async () => {
  let called = false;
  const result = await collectPetTourism({ source: "pet", startPage: 2, pages: 10, rows: 2, maxRequests: 2 }, async () => { throw Error("no save"); }, async () => { called = true; return page([]); });
  assert.equal(called, false); assert.equal(result.nextPage, 2); assert.equal(result.complete, false);
});
test("상세 수집이 막히면 성공한 원문만 별도 보존하고 완료·DB 적용은 하지 않는다", async () => {
  let partial: PetTourRecord[] = [], pendingPage = 0;
  await assert.rejects(collectPetTourism({ source: "pet", startPage: 1, pages: 1, rows: 2, maxRequests: 3 }, async () => { assert.fail("partial page must not apply"); }, async (_s, _p, _r, id) => {
    if (id === "2") throw new TourApiError("호출 제한", "LIMIT");
    return id ? page([{ contentid: id }]) : page([{ contentid: "1" }, { contentid: "2" }]);
  }, async (records, pageNo) => { partial = records; pendingPage = pageNo; }), error => error instanceof TourApiError && error.code === "LIMIT");
  assert.equal(partial.length, 1); assert.equal(partial[0].contentId, "1"); assert.equal(pendingPage, 1);
});
test("누락·중복·다른 콘텐츠 상세는 완료나 체크포인트로 기록하지 않는다", async () => {
  for (const items of [[], [{ contentid: "1" }], [{ contentid: "1" }, { contentid: "1" }]]) {
    await assert.rejects(collectPetTourism({ source: "kor", startPage: 1, pages: 1, rows: 2, maxRequests: 3 }, async () => { assert.fail("must not save"); }, async () => page(items, 10)));
  }
  await assert.rejects(collectPetTourism({ source: "pet", startPage: 1, pages: 1, rows: 1, maxRequests: 2 }, async () => { assert.fail("must not save"); }, async (_s, _p, _r, id) => page([{ contentid: id ? "999" : "1" }])), /MISMATCHED/);
  await assert.rejects(collectPetTourism({ source: "kor", startPage: 1, pages: 1, rows: 1, maxRequests: 1 }, async () => { throw Error("DB_FAILURE"); }, async () => page([{ contentid: "1" }])), /DB_FAILURE/);
});
test("출처·날짜와 자유문 조건은 사실만 보존한다", () => {
  const r = petTourRecord("pet", { contentid: "1", acmpyPsblCpam: "전 견종", acmpyNeedMtr: "목줄" }, new Date("2026-11-16T00:00:00Z"), { contentid: "1", modifiedtime: "20261115120000" });
  assert.equal(r.providerModifiedAt, "20261115120000"); assert.equal(r.facilityVerifiedAt, null);
  assert.deepEqual(petReviewHints({}), { animals: null, areas: null, requirements: null, additionalInfo: null, riskNotes: null, facilities: null });
  assert.throws(() => petTourRecord("kor", { contentid: "1" }, new Date(), { contentid: "2" }));
  assert.throws(() => fetchPetTourPage("kor", 0, 1));
});
test("공식 두 서비스 경로만 사용하고 공급자 오류에 인증값을 노출하지 않는다", async t => {
  const previous = process.env.DATA_GO_KR_API_KEY;
  process.env.DATA_GO_KR_API_KEY = "fixture-private-key";
  t.after(() => { if (previous === undefined) delete process.env.DATA_GO_KR_API_KEY; else process.env.DATA_GO_KR_API_KEY = previous; });
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: URL) => {
    paths.push(input.pathname);
    return new Response(JSON.stringify({ response: { header: { resultCode: "0000" }, body: { items: { item: { contentid: "1" } }, pageNo: 1, numOfRows: 1, totalCount: 1 } } }));
  });
  await fetchPetTourPage("kor", 1, 1); await fetchPetTourPage("pet", 1, 1); await fetchPetTourPage("pet", 1, 1, "1");
  assert.deepEqual(paths, ["/B551011/KorService2/detailPetTour2", "/B551011/KorPetTourService2/areaBasedList2", "/B551011/KorPetTourService2/detailPetTour2"]);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ response: { header: { resultCode: "22", resultMsg: "fixture-private-key" } } })));
  await assert.rejects(fetchPetTourPage("kor", 1, 1), error => error instanceof TourApiError && !error.message.includes("fixture-private-key"));
});
