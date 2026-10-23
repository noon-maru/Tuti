import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EffectivePrivacyPolicyDocument } from "../src/features/legal/EffectivePrivacyPolicyDocument";
import { privacyPolicyFrom20261010 } from "../src/shared/legal/privacyPolicySecurityUpdate";
import { locationTerms } from "../src/shared/location/terms";
import documents from "../src/shared/legal/finalizedDocuments.json";

test("현재 개인정보 처리방침의 최초 HTML은 확정 원문과 실제 서버 시행일이다", t => {
  const previousVersion = process.env.TUTI_LEGAL_POLICY_RELEASE;
  const previousTime = process.env.TUTI_LEGAL_POLICY_EFFECTIVE_AT;
  process.env.TUTI_LEGAL_POLICY_RELEASE = "2026-10-22";
  process.env.TUTI_LEGAL_POLICY_EFFECTIVE_AT = "2026-10-23T15:35:43+09:00";
  t.after(() => {
    if (previousVersion === undefined) delete process.env.TUTI_LEGAL_POLICY_RELEASE; else process.env.TUTI_LEGAL_POLICY_RELEASE = previousVersion;
    if (previousTime === undefined) delete process.env.TUTI_LEGAL_POLICY_EFFECTIVE_AT; else process.env.TUTI_LEGAL_POLICY_EFFECTIVE_AT = previousTime;
  });
  const html = renderToStaticMarkup(createElement(EffectivePrivacyPolicyDocument));
  assert.match(html, /시행일.*2026년 10월 23일/);
  assert.match(html, /문서 버전: 2026-10-22/);
  assert.ok(html.includes(documents.privacy.documentHash));
  assert.doesNotMatch(html, /개정안 확인하기|부터 서비스 보호를 위한/);
});

test("기기 시계가 과거여도 종료된 사전 공지와 과거 방침으로 되돌아가지 않는다", (t) => {
  t.mock.method(Date, "now", () => new Date("2026-09-01T00:00:00+09:00").getTime());
  const html = renderToStaticMarkup(createElement(EffectivePrivacyPolicyDocument));
  assert.match(html, /문서 버전: 2026-10-22/);
  assert.doesNotMatch(html, /개정안 확인하기|개인정보 처리방침 개정 안내/);
});

test("현재 방침에 시행 예정 부칙이 남지 않는다", () => {
  assert.equal(privacyPolicyFrom20261010.title, "Tuti 개인정보 처리방침");
  assert.doesNotMatch(JSON.stringify(privacyPolicyFrom20261010), /시행 예정일|개정안 버전/);
});

test("현행 방침은 카카오 경로 처리를 위탁으로 안내하고 차단 오안내를 제거한다", () => {
  const html = renderToStaticMarkup(createElement(EffectivePrivacyPolicyDocument));
  assert.doesNotMatch(html, /전달하는 기능은.*차단되어/);
  assert.match(html, /업무 처리자: 주식회사 카카오/);
  assert.match(html, /업무 처리자: 주식회사 카카오모빌리티/);
  assert.match(html, /대중교통·도보·자전거 경로/);
  assert.match(html, /자동차 경로/);
  assert.match(html, /출발·도착 좌표/);
  assert.match(html, /위탁에 필요한 계약·관리·감독/);
  assert.doesNotMatch(html, /2026년 10월 19일 정정/);
});

test("현행 위치약관과 개인정보방침은 철회 시 확인자료 파기를 안내한다", () => {
  assert.match(JSON.stringify(locationTerms), /철회 대상.*계속 보관하지 않는다/);
  assert.match(JSON.stringify(documents.privacy.document), /동의 철회.*지체 없이 파기/);
  assert.match(JSON.stringify(privacyPolicyFrom20261010), /철회 대상.*계속 보관하지 않습니다/);
  assert.doesNotMatch(JSON.stringify(locationTerms), /다만, 관계 법령에 따라 보존해야 하는 이용·제공사실 확인자료는 법정 기간 동안/);
});

test("앱 셸에서 종료된 개인정보 개정 사전 공지를 노출하지 않는다", () => {
  const source = readFileSync(new URL("../src/features/tuti/components/TutiAppShell.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /PrivacyUpdateNotice/);
});
