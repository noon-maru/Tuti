import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminLifelogMetricsPanel } from "../src/features/admin/AdminLifelogMetricsPanel";
import type { LifelogMetricsResponse } from "../src/shared/api/lifelogMetrics";
test("새 관리자 요약은 미계측을 0%로 꾸미지 않고 현재 보유량과 원본·책·PDF 단위를 구분한다", () => {
  const data: LifelogMetricsResponse = { asOf: "2026-10-30T01:00:00Z", period: { days: 30, start: "2026-09-30T15:00:00Z", end: "2026-10-30T01:00:00Z" }, observation: "current-surviving-data", activity: null,
    stock: { accounts: 0, writers: 0, madis: 0, withPhoto: 0, textOnly: 0, unfiled: 0, books: 0, emptyBooks: 0, filledBooks: 0,
      meanEntries: 0, medianEntries: 0, p90Entries: 0, sharedBooks: 0, collaborativeBooks: 0, participants: 0, comments: 0, pdfs: 0, pdfOwners: 0, pdfPages: 0, entryDistribution: [] } };
  const markup = renderToStaticMarkup(createElement(AdminLifelogMetricsPanel, { data, days: 30, onDaysChange() {} }));
  assert.match(markup, /미계측/); assert.match(markup, /집계 중/);
  assert.match(markup, /현재 보유량과 기간 내 성공 사건은 다릅니다/);
  assert.match(markup, /전환율이 아닙니다/);
  assert.doesNotMatch(markup, />0%/);
  for (const label of ["첫 경험·재방문", "함께 채우기", "소장·구매 관심"]) assert.ok(markup.includes(label));
});
