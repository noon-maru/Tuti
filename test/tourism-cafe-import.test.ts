import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { prisma } from "@/server/db/prisma";
import { fetchTourismCafePage, importTourismCafePlan, planTourismCafeImport } from "@/server/tourism/syncTourismCafes";
import type { TourApiPlaceItem } from "@/server/tourism/tourApiClient";

function cafe(id: string, overrides: Partial<TourApiPlaceItem> = {}): TourApiPlaceItem {
  return { contentid: id, title: "마을 카페", contenttypeid: "39", lclsSystm1: "FD", lclsSystm2: "FD05", lclsSystm3: "FD050100",
    firstimage: "https://example.com/cafe.jpg", mapx: "126.9", mapy: "37.5", addr1: "서울특별시 마포구", lDongRegnCd: "11", ...overrides };
}

test("카페와 찻집 신분류만 받고 식당·주점·기타음료점·관광 명소 응답은 차단한다", () => {
  const plan = planTourismCafeImport([cafe("1"), cafe("2", { lclsSystm3: "FD050200" }), cafe("1"),
    cafe("3", { lclsSystm3: "FD010100" }), cafe("4", { lclsSystm3: "FD050300" }), cafe("5", { contenttypeid: "12" }),
    cafe("6", { title: "커피박물관" }), cafe("7", { lclsSystm3: undefined, cat3: "A05020900" })]);
  assert.deepEqual(plan.accepted.map(item => item.contentid), ["1", "2"]);
  assert.equal(plan.skipped.length, 5);
});

test("대상 해시는 순서·중복과 무관하며 사진이나 정보가 바뀌면 달라진다", () => {
  const a = cafe("1"), b = cafe("2");
  assert.equal(planTourismCafeImport([a, b]).planHash, planTourismCafeImport([b, a, b]).planHash);
  assert.notEqual(planTourismCafeImport([a]).planHash, planTourismCafeImport([{ ...a, firstimage: "https://example.com/new.jpg" }]).planHash);
});

test("수집 전용 API는 신분류와 법정동 필터를 전달하며 잘못된 분류는 호출하지 않는다", async t => {
  process.env.DATA_GO_KR_API_KEY = "fixture-key";
  const requests: URL[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    requests.push(new URL(String(input)));
    return Response.json({ response: { header: { resultCode: "0000" }, body: { items: { item: [] }, pageNo: 1, numOfRows: 20, totalCount: 0 } } });
  });
  await fetchTourismCafePage({ categoryCode: "FD050200", pageNo: 1, numOfRows: 20, regionCode: "11", districtCode: "140" });
  const query = requests[0].searchParams;
  for (const [key, value] of Object.entries({ contentTypeId: "39", lclsSystm1: "FD", lclsSystm2: "FD05", lclsSystm3: "FD050200", lDongRegnCd: "11", lDongSignguCd: "140" })) assert.equal(query.get(key), value);
  await assert.rejects(fetchTourismCafePage({ categoryCode: "FD010100" as "FD050100", pageNo: 1, numOfRows: 20 }));
  assert.equal(requests.length, 1);
});

test("해시 불일치와 계획 변조는 DB를 열기 전에 거절한다", async () => {
  let transactions = 0;
  const database = { $transaction: async () => { transactions++; throw new Error("unexpected transaction"); } } as unknown as typeof prisma;
  const plan = planTourismCafeImport([cafe("1")]);
  await assert.rejects(importTourismCafePlan(plan, "0".repeat(64), database), /대상이 바뀌/);
  plan.accepted[0].title = "다른 이름";
  await assert.rejects(importTourismCafePlan(plan, plan.planHash, database), /대상이 바뀌/);
  assert.equal(transactions, 0);
});

test("원천·신규 장소·연결·좌표는 같은 트랜잭션에 넣고 기존 반려 장소는 수정하지 않는다", async () => {
  const created: Record<string, unknown>[] = [], linked: string[] = [];
  let sources = 0, transactions = 0, geometryWrites = 0;
  const tx = {
    $executeRaw: async (query: TemplateStringsArray) => { if (query.join("").includes("UPDATE places")) geometryWrites++; return 1; },
    tourismPlaceSourceRecord: {
      findUnique: async ({ where }: { where: { contentId: string } }) => where.contentId === "2" ? { linkedPlaceId: "old-place" } : null,
      upsert: async () => { sources++; },
      update: async ({ data }: { data: { linkedPlaceId: string } }) => { linked.push(data.linkedPlaceId); },
    },
    place: {
      findUnique: async ({ where }: { where: { source_sourceId: { sourceId: string } } }) => where.source_sourceId.sourceId === "2" ? { id: "old-place" } : null,
      create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); },
      update: async () => { throw new Error("기존 장소를 덮어쓰면 안 됨"); },
    },
  };
  const database = { $transaction: async (operation: unknown) => {
    transactions++;
    return (operation as (client: typeof tx) => Promise<unknown>)(tx);
  } } as unknown as typeof prisma;
  const plan = planTourismCafeImport([cafe("1"), cafe("2"), cafe("3", { firstimage: undefined })]);
  const result = await importTourismCafePlan(plan, plan.planHash, database);
  assert.equal(transactions, 1);
  assert.equal(sources, 3);
  assert.deepEqual(result, { sourceRecords: 3, createdPlaces: 1, existingPlacesPreserved: 1, missingImageOrCoordinates: 1, automaticallyPublished: 0 });
  assert.equal(created[0].reviewStatus, "pending");
  assert.equal(created[0].isActive, false);
  assert.equal(created[0].candidateOverride, "exclude");
  assert.deepEqual(created[0].moodTags, []);
  assert.equal(geometryWrites, 1);
  assert.deepEqual(linked, ["tourapi-1", "old-place"]);
});

test("수집 CLI는 기본 조회 전용이고 감사 도구에는 쓰기 경로가 없다", () => {
  const script = readFileSync("scripts/sync-tourism-cafes.ts", "utf8");
  const audit = readFileSync("scripts/audit-tourism-cafes.ts", "utf8");
  assert.ok(script.includes('args.includes("--apply")'));
  assert.ok(script.includes('value("--expected-plan-hash")'));
  assert.ok(script.includes('if (apply) console.log'));
  assert.ok(audit.includes("SET TRANSACTION READ ONLY"));
  assert.ok(!audit.includes(".update("));
});
