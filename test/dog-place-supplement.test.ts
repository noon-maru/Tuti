import test from "node:test";
import assert from "node:assert/strict";
import { supplementSourceSnapshot } from "@/server/tourism/supplementDogPlaceDetail";
import { normalizeTourApiPlaceDetail } from "@/server/tourism/enrichTourismPlaceDetail";
import { createEditorialFieldRepairs } from "@/server/tourism/placeEditorialRepair";
import { officialDogRestriction } from "@/server/tourism/registerDogPlace";
import { tourApiDogAccess } from "@/shared/pets/tourApiDogAccess";

test("공식 보완 자료는 기존 원문·편집을 보존하며 음식점·쇼핑 운영 필드를 인식한다", () => {
  assert.deepEqual(supplementSourceSnapshot({ overview: "기존", phone: "", untouched: "유지" }, { overview: "새 설명", phone: "031-123-4567" }), { overview: "기존", phone: "031-123-4567", untouched: "유지" });
  const result = normalizeTourApiPlaceDetail({ common: { overview: "카페 공식 소개" }, intro: { infocenterfood: "031-123-4567", opentimefood: "10~18", reservationfood: "전화" }, images: [], info: [] });
  assert.equal(result.fields.phone, "031-123-4567"); assert.equal(result.fields.openingHours, "10~18");
  assert.equal(result.fields.reservation, "전화");
  assert.equal(createEditorialFieldRepairs({ ...result.fields, overview: "수동 편집" }, result.fields).overview, undefined);
  const shopping = normalizeTourApiPlaceDetail({ common: null, intro: { opentime: "11~19", restdateshopping: "월요일", parkingshopping: "불가능" }, images: [], info: [] });
  assert.equal(shopping.fields.openingHours, "11~19"); assert.equal(shopping.fields.restDate, "월요일");
});
test("공식 불가·안내견 전용과 아직 모르는 동반 조건을 구분한다", () => {
  assert.equal(officialDogRestriction({ acmpyPsblCpam: "불가" }), "official_pet_denial");
  assert.equal(officialDogRestriction({ acmpyPsblCpam: "맹인 안내견" }), "official_assistance_dogs_only");
  for (const acmpyPsblCpam of ["불가", "맹인 안내견"]) assert.equal(tourApiDogAccess({ acmpyTypeCd: "일부구역 동반가능", acmpyPsblCpam }, new Date(Date.now() - 1000)), null);
  for (const value of ["", "소형견", "가능(소형견, 고양이)", "전 견종 동반 가능"]) assert.equal(officialDogRestriction({ acmpyPsblCpam: value }), null);
});
