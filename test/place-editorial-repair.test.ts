import assert from "node:assert/strict";
import test from "node:test";
import { createEditorialFieldRepairs, type RepairableEditorialFields } from "@/server/tourism/placeEditorialRepair";

const empty: RepairableEditorialFields = {
  overview: null, homepage: null, phone: null, openingHours: null,
  restDate: null, admissionFee: null, parking: null, reservation: null,
  usageDuration: null, experienceGuide: null,
};

test("저장된 원문이 있는 누락 필드만 복원한다", () => {
  assert.deepEqual(createEditorialFieldRepairs(empty, {
    ...empty, overview: "해변을 따라 산책할 수 있다.", parking: "주차 가능",
  }), { overview: "해변을 따라 산책할 수 있다.", parking: "주차 가능" });
});

test("기존 편집문과 체류시간은 원문이 달라도 덮어쓰지 않는다", () => {
  assert.deepEqual(createEditorialFieldRepairs({
    ...empty, overview: "편집된 소개", usageDuration: "약 1시간",
  }, { ...empty, overview: "다른 소개", usageDuration: "2시간" }), {});
});

test("원문 부재나 공백은 임의로 복원하지 않으며 반복 적용은 변경이 없다", () => {
  assert.deepEqual(createEditorialFieldRepairs(empty, { ...empty, overview: " \n " }), {});
  const normalized = { ...empty, overview: "공원 소개" };
  const repaired = { ...empty, ...createEditorialFieldRepairs(empty, normalized) };
  assert.deepEqual(createEditorialFieldRepairs(repaired, normalized), {});
});
