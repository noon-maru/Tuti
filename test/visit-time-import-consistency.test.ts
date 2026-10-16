import assert from "node:assert/strict";
import test from "node:test";
import { checkExplicitVisitTimeSource } from "@/server/recommendations/visitTimeImportConsistency";

test("최신 체류시간 원문이 없으면 과거 구조화 대신 기본 프로필로 전환한다", () => {
  for (const current of [null, undefined, "", " \n "]) {
    assert.equal(checkExplicitVisitTimeSource(current, { usageDuration: "약 2시간" }), "fallback");
  }
});

test("원문이 남아 있는데 내용이 달라졌거나 입력이 없으면 여전히 실패 대상으로 분류한다", () => {
  assert.equal(checkExplicitVisitTimeSource("약 1시간", { usageDuration: "약 2시간" }), "stale");
  assert.equal(checkExplicitVisitTimeSource("약 1시간", undefined), "stale");
});

test("공백만 달라진 원문은 동일한 구조화 입력으로 인정한다", () => {
  assert.equal(checkExplicitVisitTimeSource(" 약  1시간\n30분 ", { usageDuration: "약 1시간 30분" }), "matching");
});
