import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import RightsContactPage from "../src/app/legal/rights/page";
import { rightsContactNotice } from "../src/shared/legal/rightsContact";
import { isLegalRightsPath } from "../src/server/legal/requestGuard";

test("공개 접수 안내는 약관 시행일과 구분하고 사실인 수령인 연락 정보를 표시한다", () => {
  const html = renderToStaticMarkup(createElement(RightsContactPage));
  assert.match(html, /안내 확인일/);
  assert.doesNotMatch(html, />시행일 /);
  for (const value of ["정연한", "운영", "대표", "admin@tuti.today", "010-2724-4307", "604호", "팩스: 0504-008-4307"]) assert.ok(html.includes(value), value);
  assert.match(html, /mailto:admin@tuti.today/);
  assert.match(html, /현행 법정 서식/);
  assert.match(html, /새 서비스 이용약관.*공고나 시행을 뜻하지 않습니다/);
  assert.equal(isLegalRightsPath("/legal/rights", "GET"), true);
  assert.match(JSON.stringify(rightsContactNotice), /팩스: 0504-008-4307/);
  assert.doesNotMatch(html, /팩스: 미운영/);
});
