import test from "node:test";
import assert from "node:assert/strict";
import { dogConditions, dogConditionsBlocked } from "@/shared/pets/dogConditions";
import { tourApiDogAccess, tourApiDogAccessStatus } from "@/shared/pets/tourApiDogAccess";
test("실내를 기본 요구하지 않으며 구역 미확인을 실내·야외 가능으로 바꾸지 않는다", () => {
  const info = dogConditions("일부구역 동반가능", "실내 동반 불가, 테라스 동반 가능\n반려견 10kg 미만, 최대 2마리\n입마개 착용 필수");
  const input = { weightsKg: [8], leash: null, carrier: null, muzzle: null };
  assert.equal(dogConditionsBlocked(info, input), false);
  assert.equal(dogConditionsBlocked(info, { ...input, space: "indoor" }), true);
  assert.equal(dogConditionsBlocked(info, { ...input, space: "outdoor" }), false);
  assert.equal(dogConditionsBlocked(info, { ...input, weightsKg: [10] }), true);
  assert.equal(dogConditionsBlocked(info, { ...input, muzzle: false }), true);
  assert.equal(dogConditionsBlocked(dogConditions("전구역 동반가능", ""), { ...input, space: "indoor" }), true);
});
test("다른 조건 필드의 몸무게 제한도 원문 근거와 함께 적용한다", () => {
  const access = tourApiDogAccess({ acmpyTypeCd: "일부구역 동반가능", etcAcmpyInfo: "5kg 이하, 야외 동반 가능", acmpyNeedMtr: "목줄 착용" }, new Date(Date.now()-1000))!;
  assert.equal(access.maxWeightKg, 5);
  assert.equal(tourApiDogAccessStatus(access, { weightsKg:[8],leash:true,carrier:null }), "blocked");
  assert.equal(tourApiDogAccessStatus(access, { weightsKg:[],leash:null,carrier:null }), "needs-confirmation");
});
