import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPlaceOverviewSummaryFingerprint } from "@/server/tourism/placeOverviewSummary";
import { applyCafeEditorials, prepareCafeEditorials, type CafeEditorialRow } from "@/server/tourism/cafeEditorialPreparation";
import type { prisma } from "@/server/db/prisma";
import { deriveVisitAccessProfile } from "@/server/recommendations/placeVisitTimeProfile";

function fixture() {
  const detail = { contentId: "1", contentTypeId: "39", overview: "음료를 판매하는 마을 카페다.", experienceGuide: null, usageDuration: null,
    overviewSummary: null, admissionFee: null, parking: null, reservation: null, updatedAt: new Date("2026-11-13T00:00:00Z") };
  const row = { id: "tourapi-1", name: "마을 카페", source: "tourapi", sourceId: "1", sourceContentType: "39", sourceAddress: "서울", image: "https://example.com/cafe.jpg",
    reviewStatus: "pending", candidateOverride: "exclude", visibilityOverride: "auto", isActive: false, suggestedAction: null, visitTimeProfile: null,
    updatedAt: new Date("2026-11-13T00:00:00Z"), tourismSourceRecord: { rawPayload: { lclsSystm3: "FD050100" }, detailRecord: detail } } as unknown as CafeEditorialRow;
  const authored = { contentId: "1", sourceFingerprint: createPlaceOverviewSummaryFingerprint(detail), summary: "음료를 판매하는 마을 카페예요.", action: "음료 한 잔과 함께 잠시 머물기" };
  return { row, authored };
}

test("보강은 검토 잠금과 원문 지문을 확인하고 카페 기본 체류시간을 명시한다", () => {
  const { row, authored } = fixture();
  const plan = prepareCafeEditorials([row], [authored]);
  assert.equal(plan.updates[0].features.experienceType, "cafe");
  assert.equal(plan.updates[0].profile.stayTypicalMinutes, 30);
  assert.equal(plan.updates[0].profile.staySource, "type_default");
  assert.ok(plan.updates[0].profile.fallbackFields.includes("stayDuration"));
});

test("반려·숨김·원문 변경·기존 편집 문구를 보강으로 덮어쓰지 않는다", () => {
  for (const change of [
    (row: CafeEditorialRow) => { row.reviewStatus = "rejected"; },
    (row: CafeEditorialRow) => { row.visibilityOverride = "hide"; },
    (row: CafeEditorialRow) => { row.tourismSourceRecord!.detailRecord!.overview = "다른 원문"; },
    (row: CafeEditorialRow) => { row.suggestedAction = "운영자가 편집한 문구"; },
    (row: CafeEditorialRow) => { row.tourismSourceRecord!.detailRecord!.usageDuration = "2시간"; },
  ]) {
    const { row, authored } = fixture(); change(row);
    assert.throws(() => prepareCafeEditorials([row], [authored]));
  }
});

test("요약·행동·체류시간을 같은 트랜잭션으로 저장하고 공개 설정은 바꾸지 않는다", async () => {
  const { row, authored } = fixture();
  const writes: string[] = [];
  const tx = { $executeRaw: async () => 1,
    place: { updateMany: async ({ data }: { data: Record<string, unknown> }) => { assert.ok(!("reviewStatus" in data)); assert.ok(!("isActive" in data)); assert.ok(!("candidateOverride" in data)); writes.push("place"); return { count: 1 }; } },
    tourismPlaceDetailRecord: { updateMany: async () => { writes.push("summary"); return { count: 1 }; } },
    placeVisitTimeProfile: { create: async () => { writes.push("profile"); } },
  };
  const database = { $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } as unknown as typeof prisma;
  const plan = prepareCafeEditorials([row], [authored]);
  await assert.rejects(applyCafeEditorials(plan, "wrong", database));
  assert.deepEqual(writes, []);
  assert.deepEqual(await applyCafeEditorials(plan, plan.planHash, database), { prepared: 1, published: 0 });
  assert.deepEqual(writes, ["place", "summary", "profile"]);
});

test("카페 12곳의 요약·행동 문구를 공통 배포 데이터에도 포함한다", () => {
  const manifest = JSON.parse(readFileSync("data/cafe-editorials/2026-11-13.json", "utf8"));
  const read = (file: string) => readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const summaries = read("data/place-overview-summaries/2026-10-01.jsonl"), actions = read("data/place-suggested-actions/2026-10-01.jsonl");
  assert.equal(Object.keys(manifest).length, 12);
  for (const id of Object.keys(manifest)) {
    const summary = summaries.filter(row => row.contentId === id), action = actions.filter(row => row.contentId === id);
    assert.equal(summary.length, 1); assert.ok(summary[0].summary.length <= 180);
    assert.equal(action.length, 1); assert.ok(action[0].action.length <= 60);
    assert.ok(!/무료|치료|예방/.test(summary[0].summary));
  }
});

test("선택 티클래스 예약과 카페 전체 예약을 구분한다", () => {
  const source = { name: "찻집", contentTypeId: "39", experienceType: "cafe" as const, overview: "차를 마실 수 있다. 단, 티클래스는 예약제로 운영된다." };
  assert.equal(deriveVisitAccessProfile(source).reservationRequirement, "none");
  assert.equal(deriveVisitAccessProfile({ ...source, reservation: "사전 예약 필수" }).reservationRequirement, "required");
  assert.equal(deriveVisitAccessProfile({ ...source, overview: "카페 전체가 예약제로 운영된다." }).reservationRequirement, "required");
});
