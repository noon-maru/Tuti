import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EffectivePrivacyPolicyDocument } from "../src/features/legal/EffectivePrivacyPolicyDocument";
import { privacyPolicyFrom20261010 } from "../src/shared/legal/privacyPolicySecurityUpdate";
import { locationTerms } from "../src/shared/location/terms";

test("현재 개인정보 처리방침의 최초 HTML은 10월 10일 시행본이다", () => {
  const html = renderToStaticMarkup(createElement(EffectivePrivacyPolicyDocument));
  assert.match(html, /시행일.*2026년 10월 10일/);
  assert.match(html, /개인정보 처리방침 버전: 2026-10-10/);
  assert.doesNotMatch(html, /개정안 확인하기|부터 서비스 보호를 위한/);
});

test("기기 시계가 과거여도 종료된 사전 공지와 과거 방침으로 되돌아가지 않는다", (t) => {
  t.mock.method(Date, "now", () => new Date("2026-09-01T00:00:00+09:00").getTime());
  const html = renderToStaticMarkup(createElement(EffectivePrivacyPolicyDocument));
  assert.match(html, /개인정보 처리방침 버전: 2026-10-10/);
  assert.doesNotMatch(html, /개정안 확인하기|개인정보 처리방침 개정 안내/);
});

test("현재 방침에 시행 예정 부칙이 남지 않는다", () => {
  assert.equal(privacyPolicyFrom20261010.title, "Tuti 개인정보 처리방침");
  assert.doesNotMatch(JSON.stringify(privacyPolicyFrom20261010), /시행 예정일|개정안 버전/);
});

test("현행 위치약관과 개인정보방침은 철회 시 확인자료 파기를 안내한다", () => {
  for (const document of [locationTerms, privacyPolicyFrom20261010]) {
    assert.match(JSON.stringify(document), /철회 대상.*계속 보관하지 않습니다/);
  }
  assert.doesNotMatch(JSON.stringify(locationTerms), /다만, 관계 법령에 따라 보존해야 하는 이용·제공사실 확인자료는 법정 기간 동안/);
});

test("앱 셸에서 종료된 개인정보 개정 사전 공지를 노출하지 않는다", () => {
  const source = readFileSync(new URL("../src/features/tuti/components/TutiAppShell.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /PrivacyUpdateNotice/);
});
