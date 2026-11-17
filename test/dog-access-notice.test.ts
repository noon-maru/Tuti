import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DogAccessNotice } from "../src/features/tuti/components/DogAccessNotice";
import { tourApiDogAccess } from "../src/shared/pets/tourApiDogAccess";

test("동반 상세는 필수 구역·조건·준비물을 먼저 표시하고 긴 원문만 접는다", () => {
  const access = tourApiDogAccess({ acmpyTypeCd: "전구역 동반가능", etcAcmpyInfo: "<script>원문</script>" }, new Date(Date.now() - 1000))!;
  const html = renderToStaticMarkup(createElement(DogAccessNotice, { access }));
  assert.match(html, /반려견과 함께 가기/);
  assert.match(html, /방문 전 조건을 확인해주세요/);
  assert.ok(html.indexOf("동반 구역") < html.indexOf("<details"));
  assert.ok(html.indexOf("준비물") < html.indexOf("<details"));
  assert.match(html, /시설·상세 안내/);
  assert.match(html, /수집일/); assert.match(html, /미기재/);
  assert.doesNotMatch(html, /몸무게 제한 없음|확인일|<script>/);
  assert.match(html, /공식 데이터 출처 보기/);
});
test("검토 자료는 별도 확인일과 실제 제한을 표시한다", () => {
  const html = renderToStaticMarkup(createElement(DogAccessNotice, { access: { allowed: true, areas: "테라스", rules: "실내 제외", maxWeightKg: 10, leashRequired: true, carrierRequired: false, sourceUrl: "https://fixture.example/notice", checkedAt: "2026-11-16T00:00:00Z", validUntil: "2026-12-01T00:00:00Z" } }));
  assert.match(html, /확인일 2026-11-16/); assert.match(html, /10kg 이하/);
  assert.doesNotMatch(html, /공식 등록|수집일/);
});
