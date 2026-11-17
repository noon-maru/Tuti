import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { EditorialBackfillRow } from "@/server/tourism/placeEditorialBackfill";
import { createPlaceOverviewSummaryFingerprint } from "@/server/tourism/placeOverviewSummary";

const writes: Array<{ kind: string; input: { where: Record<string, unknown>; data: Record<string, unknown> } }> = [];
let updateCount = 1, eligible = 1;
const transaction = {
  $executeRaw: async () => 0,
  $queryRaw: async () => [{ id: "place", contentId: "12345", updatedAt: new Date("2026-11-17T00:00:00Z") }],
  place: { count: async () => eligible, updateMany: async (input: typeof writes[number]["input"]) => { writes.push({ kind: "place", input }); return { count: updateCount }; } },
  tourismPlaceDetailRecord: { updateMany: async (input: typeof writes[number]["input"]) => { writes.push({ kind: "detail", input }); return { count: updateCount }; } },
};
(globalThis as { prisma?: unknown }).prisma = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) };
const { editorialSource, editorialSourceFingerprint, parseAuthoredEditorials, prepareEditorialBackfill, applyEditorialBackfill,
  parseReviewedEditorials, prepareReviewedEditorials, applyReviewedEditorials } = await import("../src/server/tourism/placeEditorialBackfill");

function row(): EditorialBackfillRow {
  return { id: "place", sourceId: "12345", name: "연못공원", sourceAddress: "서울", sourceContentType: "12", suggestedAction: null, updatedAt: new Date("2026-11-17T00:00:00Z"),
    tourismSourceRecord: { detailRecord: { contentId: "12345", contentTypeId: "12", overview: "연못을 따라 산책로가 이어지는 공원이다.", overviewSummary: null, summarySourceFingerprint: null,
      experienceGuide: null, commonPayload: null, introPayload: null, infoPayload: null, updatedAt: new Date("2026-11-17T00:00:00Z") } } };
}
function item(value = row()) { return { contentId: value.sourceId!, sourceFingerprint: editorialSourceFingerprint(value), summary: "연못을 따라 산책로가 이어지는 공원이에요.", action: "연못 가장자리의 산책로 걷기" }; }

test("원문 해시·중복·길이·예상 대상 검증을 통과한 빈 필드만 계획한다", () => {
  const value = row(), authored = item(value);
  assert.equal(prepareEditorialBackfill([value], [authored]).updates.length, 1);
  assert.deepEqual(parseAuthoredEditorials(JSON.stringify(authored)), [authored]);
  assert.throws(() => parseAuthoredEditorials(JSON.stringify({ ...authored, action: "가".repeat(61) })));
  assert.throws(() => parseAuthoredEditorials(`${JSON.stringify(authored)}\n${JSON.stringify(authored)}`));
  assert.throws(() => prepareEditorialBackfill([], [authored]), /추천 대상/);
  value.name = "변경된 이름";
  assert.throws(() => prepareEditorialBackfill([value], [authored]), /원문 변경/);
});

test("기존 소개·행동·체험 원문은 덮어쓰지 않고 이미 완료된 입력은 건너뛴다", () => {
  const value = row();
  value.suggestedAction = "운영자가 편집한 행동";
  value.tourismSourceRecord!.detailRecord!.overviewSummary = "운영자가 편집한 소개";
  assert.equal(prepareEditorialBackfill([value], [item(value)]).updates.length, 0);
  value.tourismSourceRecord!.detailRecord!.overviewSummary = null;
  const update = prepareEditorialBackfill([value], [item(value)]).updates[0];
  assert.equal(update.action, undefined);
  assert.ok(update.summary);
});

test("저장된 common 원문 복원은 빈 원문에 한정하고 최종 원문의 요약 지문을 기록한다", async () => {
  const value = row(), detail = value.tourismSourceRecord!.detailRecord!;
  detail.overview = null;
  detail.commonPayload = { overview: "연못 옆 산책로가 있는 공원이다." };
  assert.ok(editorialSource(value).overview);
  const plan = prepareEditorialBackfill([value], [item(value)]);
  writes.length = 0; updateCount = 1; eligible = 1;
  await applyEditorialBackfill(plan, plan.planHash);
  const data = writes.find(write => write.kind === "detail")!.input.data;
  assert.equal(data.overview, editorialSource(value).overview);
  assert.equal(data.summarySourceFingerprint, createPlaceOverviewSummaryFingerprint({ contentTypeId: detail.contentTypeId, overview: data.overview as string, experienceGuide: detail.experienceGuide }));
  assert.equal("experienceGuide" in data, false);
  assert.equal(writes.find(write => write.kind === "place")!.input.where.updatedAt, value.updatedAt);
  assert.equal(writes[0].input.where.updatedAt, detail.updatedAt);
  detail.overview = null; detail.commonPayload = null;
  assert.throws(() => prepareEditorialBackfill([value], [item(value)]), /소개 근거 부족/);
});

test("계획 해시·동시 수정·추천 범위 변경은 반영을 중단한다", async () => {
  const value = row(), plan = prepareEditorialBackfill([value], [item(value)]);
  await assert.rejects(applyEditorialBackfill(plan, "changed"), /해시/);
  writes.length = 0; eligible = 1; updateCount = 0;
  await assert.rejects(applyEditorialBackfill(plan, plan.planHash), /동시에 수정/);
  assert.equal(writes.some(write => write.kind === "place"), false);
  writes.length = 0; eligible = 0; updateCount = 1;
  await assert.rejects(applyEditorialBackfill(plan, plan.planHash), /추천 범위/);
  assert.equal(writes.length, 0);
  eligible = 1;
});

test("직접 승인한 기존 요약만 텍스트 변경 없이 재검증하며 다른 편집값·원문 변경은 차단한다", async () => {
  const value = row(), detail = value.tourismSourceRecord!.detailRecord!;
  detail.overviewSummary = "연못을 따라 산책할 수 있는 공원이에요.";
  detail.summarySourceFingerprint = "old";
  const review = { contentId: value.sourceId!, sourceFingerprint: editorialSourceFingerprint(value), existingSummary: detail.overviewSummary, approved: true, reason: "원문의 연못·산책로와 일치" };
  assert.deepEqual(parseReviewedEditorials(JSON.stringify(review)), [review]);
  assert.equal(prepareReviewedEditorials([value], [{ ...review, approved: false }]).updates.length, 0);
  const plan = prepareReviewedEditorials([value], [review]);
  writes.length = 0; eligible = 1; updateCount = 1;
  await applyReviewedEditorials(plan, plan.planHash);
  assert.deepEqual(writes[0].input.data, { summarySourceFingerprint: createPlaceOverviewSummaryFingerprint(detail) });
  detail.overviewSummary = "수동으로 바뀐 요약";
  assert.throws(() => prepareReviewedEditorials([value], [review]), /원문\/문구 변경/);
});

test("재검토 교정은 명시된 기존 문구만 교체하며 재실행과 미승인 입력을 보호한다", async () => {
  const value = row(), detail = value.tourismSourceRecord!.detailRecord!;
  detail.overviewSummary = "확인되지 않은 시설이 있다는 기존 문구";
  detail.summarySourceFingerprint = "old";
  const review = { contentId: value.sourceId!, sourceFingerprint: editorialSourceFingerprint(value), existingSummary: detail.overviewSummary,
    replacementSummary: "연못을 따라 산책로가 이어지는 공원이에요.", approved: true, reason: "원문에 있는 연못·산책로만 남김" };
  assert.deepEqual(parseReviewedEditorials(JSON.stringify(review)), [review]);
  assert.throws(() => parseReviewedEditorials(JSON.stringify({ ...review, approved: false })), /교정 문구/);
  assert.throws(() => parseReviewedEditorials(JSON.stringify({ ...review, replacementSummary: "가".repeat(181) })), /교정 문구/);
  const plan = prepareReviewedEditorials([value], [review]);
  await assert.rejects(applyReviewedEditorials(plan, "wrong"), /해시/);
  writes.length = 0; eligible = 1; updateCount = 1;
  const result = await applyReviewedEditorials(plan, plan.planHash);
  assert.equal(result.corrected, 1);
  assert.equal(result.existingSummaryTextChanged, true);
  assert.equal(writes[0].input.where.overviewSummary, review.existingSummary);
  assert.equal(writes[0].input.data.overviewSummary, review.replacementSummary);
  assert.equal("experienceGuide" in writes[0].input.data, false);
  assert.equal(writes.some(write => write.kind === "place"), false);
  detail.overviewSummary = review.replacementSummary;
  detail.summarySourceFingerprint = createPlaceOverviewSummaryFingerprint(detail);
  assert.equal(prepareReviewedEditorials([value], [review]).updates.length, 0);
  detail.overviewSummary = "다른 운영자가 편집한 문구";
  assert.throws(() => prepareReviewedEditorials([value], [review]), /원문\/문구 변경/);
});

test("재검토 교정 시 저장된 common 원문이 있으면 빈 소개만 복원하고 최종 지문을 맞춘다", async () => {
  const value = row(), detail = value.tourismSourceRecord!.detailRecord!;
  detail.overview = null;
  detail.commonPayload = { overview: "연못이 있는 공원이다." };
  detail.overviewSummary = "잘못된 소개";
  const review = { contentId: value.sourceId!, sourceFingerprint: editorialSourceFingerprint(value), existingSummary: detail.overviewSummary,
    replacementSummary: "연못이 있는 공원이에요.", approved: true, reason: "저장된 원문으로 수정" };
  const plan = prepareReviewedEditorials([value], [review]);
  writes.length = 0; eligible = 1; updateCount = 1;
  await applyReviewedEditorials(plan, plan.planHash);
  assert.equal(writes[0].input.data.overview, "연못이 있는 공원이다.");
  assert.equal(writes[0].input.data.summarySourceFingerprint, createPlaceOverviewSummaryFingerprint({ ...detail, overview: "연못이 있는 공원이다." }));
  detail.commonPayload = null;
  assert.throws(() => prepareReviewedEditorials([value], [{ ...review, sourceFingerprint: editorialSourceFingerprint(value) }]), /소개 근거 부족/);
});

test("직접 작성한 140곳의 문구는 원문 입력과 ID·해시가 일치하고 길이 한도를 지킨다", () => {
  const all = ["a", "b", "c"].flatMap(label => {
    const source = readFileSync(`data/place-editorials/source/2026-11-17/${label}.jsonl`, "utf8").trim().split("\n").map(line => JSON.parse(line) as { contentId: string; sourceFingerprint: string });
    const authored = parseAuthoredEditorials(readFileSync(`data/place-editorials/2026-11-17-${label}.jsonl`, "utf8"));
    assert.deepEqual(authored.map(item => item.contentId).sort(), source.map(item => item.contentId).sort());
    for (const item of authored) assert.equal(item.sourceFingerprint, source.find(value => value.contentId === item.contentId)?.sourceFingerprint);
    return authored;
  });
  assert.equal(all.length, 140);
  assert.equal(new Set(all.map(item => item.contentId)).size, 140);
});

test("기존 요약 검토 138건은 보관한 원문·기존 문구와 일치하며 미승인 항목을 구분한다", () => {
  const sources = readFileSync("data/place-editorials/source/2026-11-17/stale-b.jsonl", "utf8").trim().split("\n")
    .map(line => JSON.parse(line) as { contentId: string; sourceFingerprint: string; existingSummary: string });
  const reviews = parseReviewedEditorials(readFileSync("data/place-editorials/2026-11-17-review-b.jsonl", "utf8"));
  assert.equal(reviews.length, 138);
  assert.deepEqual(reviews.map(item => item.contentId).sort(), sources.map(item => item.contentId).sort());
  for (const review of reviews) {
    const source = sources.find(item => item.contentId === review.contentId)!;
    assert.equal(review.sourceFingerprint, source.sourceFingerprint);
    assert.equal(review.existingSummary, source.existingSummary);
  }
  assert.equal(reviews.filter(item => item.approved).length, 104);
  assert.equal(reviews.filter(item => !item.approved).length, 34);
});

test("재검토 교정 310건은 미검토 276곳과 기존 불일치 34곳만 포함한다", () => {
  const readLines = (path: string) => readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line) as { contentId: string; sourceFingerprint: string; existingSummary: string });
  const pending = parseReviewedEditorials(readFileSync("data/place-editorials/2026-11-17-review-b.jsonl", "utf8")).filter(item => !item.approved);
  const sources = ["a", "c"].flatMap(label => readLines(`data/place-editorials/source/2026-11-17/stale-${label}.jsonl`));
  const expected = [...sources, ...pending];
  const corrections = parseReviewedEditorials(readFileSync("data/place-editorials/2026-11-17-review-corrections.jsonl", "utf8"));
  assert.equal(corrections.length, 310);
  assert.deepEqual(corrections.map(item => item.contentId).sort(), expected.map(item => item.contentId).sort());
  for (const correction of corrections) {
    const original = expected.find(item => item.contentId === correction.contentId)!;
    assert.equal(correction.sourceFingerprint, original.sourceFingerprint);
    assert.equal(correction.existingSummary, original.existingSummary);
    assert.equal(correction.approved, true);
    assert.ok(correction.replacementSummary);
  }
  assert.match(corrections.find(item => item.contentId === "129043")!.replacementSummary!, /전소/);
  assert.match(corrections.find(item => item.contentId === "1613870")!.replacementSummary!, /개방하지/);
  assert.match(corrections.find(item => item.contentId === "129201")!.replacementSummary!, /1927년/);
  assert.match(corrections.find(item => item.contentId === "2756654")!.replacementSummary!, /봉화/);
});
