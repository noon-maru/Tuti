import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkEditorialCoverage } from "../src/server/tourism/placeEditorialCoverage";
import { createEditorialFieldRepairs, type RepairableEditorialFields } from "../src/server/tourism/placeEditorialRepair";
import { checkExplicitVisitTimeSource } from "../src/server/recommendations/visitTimeImportConsistency";

type Row = { contentId: string; summary?: string | null; action?: string; usageDuration?: string;
  minimumMinutes?: number; typicalMinutes?: number; maximumMinutes?: number; source?: string; evidence?: string };
function rows(path: string): Row[] {
  const result = readFileSync(path, "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line) as Row);
  assert.equal(new Set(result.map(row => row.contentId)).size, result.length, `${path} 식별자 중복`);
  return result;
}
const summaries = rows("data/place-overview-summaries/2026-10-01.jsonl");
const actions = rows("data/place-suggested-actions/2026-10-01.jsonl");
const durations = ["a", "b", "c", "d"].flatMap(batch => rows(`data/place-visit-time-profiles/2026-10-02-explicit-${batch}.jsonl`));
const inputs = rows("data/place-visit-time-profiles/2026-10-02-explicit-input.jsonl");
const targets = ["2037031", "2751855", "2736400", "3083730", "2795749"];

test("배포를 막았던 5곳은 누락 필드 복원과 최신 입력 적용 후 동일한 엄격 검사에서 통과한다", () => {
  const current = targets.map(contentId => ({ contentId, name: contentId, hasDetail: true,
    overview: ["2037031", "2751855", "3083730"].includes(contentId) ? null : "저장된 소개",
    normalizedRawOverview: "저장된 원문 소개", usageDuration: contentId === "2795749" ? "약 1~2시간" : null }));
  const updated = {
    summaries: new Map(summaries.map(row => [row.contentId, row.summary ?? null])),
    actions: new Map(actions.map(row => [row.contentId, row.action!])),
    explicit: new Set(durations.map(row => row.contentId)),
    explicitInputs: new Map(inputs.map(row => [row.contentId, row.usageDuration!])),
  };
  const before = { ...updated, summaries: new Map(updated.summaries), actions: new Map(updated.actions), explicitInputs: new Map(updated.explicitInputs) };
  before.summaries.delete("2736400"); before.actions.delete("2736400"); before.explicitInputs.set("2795749", "1~2시간");
  assert.equal(checkEditorialCoverage(current, before).errors.length, 9);
  const empty: RepairableEditorialFields = { overview: null, homepage: null, phone: null, openingHours: null,
    restDate: null, admissionFee: null, parking: null, reservation: null, usageDuration: null, experienceGuide: null };
  const repaired = current.map(place => ({ ...place, ...createEditorialFieldRepairs({ ...empty, overview: place.overview }, { ...empty, overview: place.normalizedRawOverview }) }));
  assert.deepEqual(checkEditorialCoverage(repaired, updated), { errors: [], warnings: [] });
});

test("추가 요약·행동은 길이 제한을 지키고 체류시간은 현재 원문과 일치하는 직접 검토 결과다", () => {
  const summary = summaries.find(row => row.contentId === "2736400")!.summary!;
  const action = actions.find(row => row.contentId === "2736400")!.action!;
  assert.ok(summary.length > 0 && summary.length <= 180);
  assert.ok(action.length > 0 && action.length <= 60);
  assert.match(summary, /죽전동/); assert.match(summary, /휴식 공간/);
  assert.match(action, /휴식 공간/);
  const input = inputs.find(row => row.contentId === "2795749")!;
  const result = durations.find(row => row.contentId === "2795749")!;
  assert.equal(checkExplicitVisitTimeSource("약 1~2시간", { usageDuration: input.usageDuration! }), "matching");
  assert.deepEqual([result.minimumMinutes, result.typicalMinutes, result.maximumMinutes], [60, 90, 120]);
  assert.equal(result.source, "manual_override");
  assert.match(result.evidence!, /약 1~2시간/);
});
