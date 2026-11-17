import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DogAccessNotice } from "../src/features/tuti/components/DogAccessNotice";
import { tourApiDogAccess } from "../src/shared/pets/tourApiDogAccess";

test("공식 등록의 미확인 경고는 접힌 상태에서도 보이며 수집일·미기재를 사실대로 표시한다", () => {
  const access = tourApiDogAccess({ acmpyTypeCd: "전구역 동반가능", etcAcmpyInfo: "<script>원문</script>" }, new Date(Date.now() - 1000))!;
  const html = renderToStaticMarkup(createElement(DogAccessNotice, { access }));
  assert.match(html, /<summary>동반 등록 장소 · 방문 전 조건 확인 필요<\/summary>/);
  assert.match(html, /수집일/); assert.match(html, /미기재/);
  assert.doesNotMatch(html, /몸무게 제한 없음|확인일|<script>/);
  assert.match(html, /공식 데이터 출처 보기/);
});
test("검토 자료는 별도 확인일과 실제 제한을 표시한다", () => {
  const html = renderToStaticMarkup(createElement(DogAccessNotice, { access: { allowed: true, areas: "테라스", rules: "실내 제외", maxWeightKg: 10, leashRequired: true, carrierRequired: false, sourceUrl: "https://fixture.example/notice", checkedAt: "2026-11-16T00:00:00Z", validUntil: "2026-12-01T00:00:00Z" } }));
  assert.match(html, /확인일 2026-11-16/); assert.match(html, /10kg 이하/);
  assert.doesNotMatch(html, /공식 등록|수집일/);
});
