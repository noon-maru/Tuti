import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DepartureDogAccessNotice } from "../src/features/tuti/components/DepartureDogAccessNotice";
import { tourApiDogAccess } from "../src/shared/pets/tourApiDogAccess";
import type { DogAccess } from "../src/shared/pets/dogAccess";

const render = (access?: Parameters<typeof DepartureDogAccessNotice>[0]["access"]) => renderToStaticMarkup(createElement(DepartureDogAccessNotice, { access }));
test("공식 동반 안내의 제한은 출발 전에 보이고 상세·출처는 명시적으로 펼친다", () => {
  const access = tourApiDogAccess({ acmpyTypeCd: "일부구역 동반가능", acmpyPsblCpam: "10kg 미만, 최대 2마리", acmpyNeedMtr: "목줄 착용" }, new Date(Date.now() - 1000))!;
  const html = render(access), beforeFold = html.slice(0, html.indexOf("<details"));
  for (const text of ["방문 전 조건을 확인해주세요", "일부구역 동반가능", "10kg 미만", "최대 2마리", "목줄"]) assert.ok(beforeFold.includes(text), text);
  assert.match(html, /동반 조건·출처 보기/); assert.match(html, /공식 데이터 출처 보기/);
  assert.doesNotMatch(html, /모든 조건 충족|입장 보장/);
});

test("미기재·자료 없음·기간 경과는 조건 충족이나 제한 없음으로 바꾸지 않는다", () => {
  const access = tourApiDogAccess({ acmpyTypeCd: "전구역 동반가능" }, new Date(Date.now() - 1000))!;
  assert.match(render(access), /구역별 몸무게·견종 조건은 전체 안내/);
  assert.doesNotMatch(render(access), /몸무게 제한 없음/);
  assert.match(render({ ...access, freshUntil: "2000-01-01T00:00:00Z" }), /정보 확인 기간이 지났어요/);
  assert.match(render(), /동반 조건을 확인하지 못했어요/);
});

test("별도 검토 정보의 날짜·원문·확인 수준을 유지한다", () => {
  const now = Date.now();
  const access: DogAccess = { allowed: true, areas: "야외 테라스", rules: "실내 제외", maxWeightKg: 12, leashRequired: true, carrierRequired: false,
    sourceUrl: "https://fixture.example/rules", checkedAt: new Date(now - 1000).toISOString(), validUntil: new Date(now + 60_000).toISOString() };
  const html = render(access);
  assert.match(html, /별도 검토 안내/); assert.match(html, /12kg 이하/);
  assert.match(html, /확인일/); assert.match(html, /fixture.example\/rules/);
  assert.match(render({ ...access, allowed: false }), /동반 불가 안내/);
  assert.match(render({ ...access, requiresOutingConfirmation: true }), /방문 전 조건을 확인해주세요/);
});

test("동반 시 출발 주 경로·각 표시 모드에 안내가 이어지고 비동반에서는 숨긴다", () => {
  const source = readFileSync("src/features/tuti/screens/departure/DeparturePlanScreen.tsx", "utf8");
  assert.match(source, /state.answers.petCompanion === "dog"/);
  assert.match(source, /withDog && <DepartureDogAccessNotice access=\{place.dogAccess\}/);
  assert.ok(source.indexOf("{withDog && <DepartureDogAccessNotice") < source.indexOf("{!userLocation ? ("));
  for (const file of ["ExpandedDeparturePlanScreen", "FullscreenDeparturePlanScreen"]) {
    assert.match(readFileSync(`src/features/tuti/screens/departure/${file}.tsx`, "utf8"), /<DeparturePlanScreen[\s\S]*?place=\{place\}/);
  }
});
