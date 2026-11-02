import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { AdminLifelogMetricsPanel } from "../src/features/admin/AdminLifelogMetricsPanel";
import type { LifelogMetricsResponse } from "../src/shared/api/lifelogMetrics";
test("새 관리자 요약은 미계측을 0%로 꾸미지 않고 현재 보유량과 원본·책·PDF 단위를 구분한다", () => {
  const data: LifelogMetricsResponse = { asOf: "2026-10-30T01:00:00Z", period: { days: 30, start: "2026-09-30T15:00:00Z", end: "2026-10-30T01:00:00Z" }, observation: "current-surviving-data", activity: null,
    stock: { accounts: 0, writers: 0, madis: 0, withPhoto: 0, textOnly: 0, unfiled: 0, books: 0, emptyBooks: 0, filledBooks: 0,
      meanEntries: 0, medianEntries: 0, p90Entries: 0, sharedBooks: 0, collaborativeBooks: 0, participants: 0, comments: 0, pdfs: 0, pdfOwners: 0, pdfPages: 0, entryDistribution: [] } };
  const markup = renderToStaticMarkup(createElement(AdminLifelogMetricsPanel, { data, days: 30, onDaysChange() {} }));
  assert.match(markup, /미계측/); assert.match(markup, /집계 중/);
  assert.doesNotMatch(markup, /현재 보유량과 기간 내 성공 사건은 다릅니다|전환율이 아닙니다/);
  assert.match(markup, /현재 마디·하루마디·PDF/);
  assert.match(markup, /하루마디 열람 사용자 · 30일/);
  assert.match(markup, /반복 열람 사용자 · 30일/);
  assert.doesNotMatch(markup, />0%/);
  for (const label of ["첫 경험·재방문", "함께 채우기", "소장·구매 관심"]) assert.ok(markup.includes(label));
});

test("중복 설명을 제거하되 계측 상태·기존 수치·코호트 기간은 유지한다", () => {
  const data: LifelogMetricsResponse = {
    asOf: "2026-11-02T00:00:00Z", period: { days: 30, start: "2026-10-03T00:00:00Z", end: "2026-11-02T00:00:00Z" }, observation: "current-surviving-data",
    stock: { accounts: 2, writers: 2, madis: 3, withPhoto: 1, textOnly: 2, unfiled: 0, books: 2, emptyBooks: 0, filledBooks: 2, meanEntries: 1.5, medianEntries: 1, p90Entries: 2, sharedBooks: 0, collaborativeBooks: 0, participants: 0, comments: 0, pdfs: 0, pdfOwners: 0, pdfPages: 0 },
    activity: { retainedSince: "2026-10-30T05:08:00Z", writerUsers: 2, newMadis: 3, repeatWriters30d: 0, readerUsers: 2, repeatReaders30d: 0, manualBooks: 1, automaticBooks: 1, saveFailedUsers: 0, draftResumedUsers: 0, composeExitedUsers: 0, pdfFailedUsers: 0, inviteFailedUsers: 0, updatedBooks: 1, activeCollaborativeBooks: 0, invites: 0, acceptedInvites: 0, matureInvites: 0, matureAccepted: 0, contributors: 0, firstContributors: 0, pdfs: 0, exporters: 0, purchaseViewers: 0, purchaseClickers: 0, activation: { eligible: 0, pending: 2, converted: 0, medianMinutes: null, rate: null }, cohorts: [], paths: [], daily: [] },
  };
  const render = () => renderToStaticMarkup(createElement(AdminLifelogMetricsPanel, { data, days: 30, onDaysChange() {} }));
  const markup = render();
  assert.match(markup, /일부 기간 미계측/);
  assert.match(markup, /<dt>하루마디 열람 사용자 · 30일<\/dt><dd>2<\/dd>/);
  assert.match(markup, /<dt>반복 열람 사용자 · 30일<\/dt><dd>0<\/dd>/);
  assert.match(markup, /집계 중/);
  assert.doesNotMatch(markup, /보존된 관측 자료 시작|재열람과 재기록은 별개의 가치|과거 보유량|구버전 앱/);
  data.activity!.retainedSince = "2026-10-01T00:00:00Z";
  assert.doesNotMatch(render(), /일부 기간 미계측/);
  const source = readFileSync("src/features/admin/AdminLifelogMetricsPanel.tsx", "utf8");
  assert.match(source, /W1 재기록 · 7~13일/);
  assert.match(source, /W4 열람 · 28~34일/);
  for (const field of ["manualBooks", "automaticBooks", "inviteFailedUsers", "pdfFailedUsers"]) assert.ok(source.includes(`value(a?.${field})`));
  assert.doesNotMatch(source, /현재 주문·결제·제작·배송 기능은 없습니다|첫 마디와 함께 자동 생성된 책을 독립적인/);
});
