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
  assert.equal(dogConditionsBlocked(dogConditions("일부구역 동반가능", "실내 동반 가능한지 문의해주세요"), { ...input, space: "indoor" }), true);
});
test("다른 조건 필드의 몸무게 제한도 원문 근거와 함께 적용한다", () => {
  assert.equal(tourApiDogAccess({acmpyTypeCd:"일부구역 동반가능",acmpyPsblCpam:"보조견 동반 입장 가능"},new Date(Date.now()-1000)),null,"보조견에 대한 안내만으로 일반 반려견 동반을 추정하지 않는다");
  const access = tourApiDogAccess({ acmpyTypeCd: "일부구역 동반가능", etcAcmpyInfo: "5kg 이하, 야외 동반 가능", acmpyNeedMtr: "목줄 착용" }, new Date(Date.now()-1000))!;
  assert.equal(access.maxWeightKg, 5);
  assert.equal(tourApiDogAccessStatus(access, { weightsKg:[8],leash:true,carrier:null }), "blocked");
  assert.equal(tourApiDogAccessStatus(access, { weightsKg:[],leash:null,carrier:null }), "needs-confirmation");
});
test("구역 제한과 전역 동반 불가를 구분하고 입력이 없어도 전역 불가는 차단한다", () => {
  assert.equal(dogConditionsBlocked(dogConditions("일부구역 동반가능", "반려견 동반 불가")),true);
  assert.equal(dogConditionsBlocked(dogConditions("일부구역 동반가능", "실내 동반 불가, 테라스 동반 가능")),false);
  assert.equal(dogConditionsBlocked(dogConditions("일부구역 동반가능", "실내 이동장 사용 필수\n야외 동반 가능"),{weightsKg:[],leash:true,carrier:false,space:"outdoor"}),false);
  const scoped=dogConditions("일부구역 동반가능","실내 동반 가능 10kg 이하, 야외 동반 가능");
  assert.equal(dogConditionsBlocked(scoped,{weightsKg:[15],leash:true,carrier:null,space:"outdoor"}),false);
  assert.equal(dogConditionsBlocked(scoped,{weightsKg:[15],leash:true,carrier:null,space:"indoor"}),true);
  const indoorCarrier=dogConditions("일부구역 동반가능","실내 동반 가능\n실내 이동장 사용 필수\n야외 동반 가능");
  assert.equal(dogConditionsBlocked(indoorCarrier,{weightsKg:[],leash:null,carrier:false,space:"indoor"}),true);
  assert.equal(dogConditionsBlocked(indoorCarrier,{weightsKg:[],leash:null,carrier:false,space:"outdoor"}),false);
});
