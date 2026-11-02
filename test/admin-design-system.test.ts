import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminDesignSystem } from "../src/features/admin/AdminDesignSystem";
import { adminTheme } from "../src/features/admin/adminTheme";
import { AdminUserActivityPanel } from "../src/features/admin/AdminUserActivityPanel";
import type { AdminUserActivityResponse } from "../src/shared/api/admin";

test("모든 관리자 하위 라우트는 같은 전용 테마를 쓰고 경고·오류 색은 보존한다", () => {
  const layout = readFileSync("src/app/admin/layout.tsx", "utf8");
  assert.match(layout, /<AdminDesignSystem>[\s\S]*\{children\}[\s\S]*<\/AdminDesignSystem>/);
  assert.equal(adminTheme["--color-text"], "#1b2d32");
  assert.equal(adminTheme["--admin-card-radius"], "14px");
  assert.equal("--color-error" in adminTheme, false);
  assert.equal("--color-warning" in adminTheme, false);
  const html = renderToStaticMarkup(createElement(AdminDesignSystem, null, "관리자"));
  assert.match(html, /--admin-card-background:#ffffff/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /focus-visible/);
  const main = readFileSync("src/features/admin/AdminScreen.tsx", "utf8");
  assert.doesNotMatch(main, /--admin-card-background:|--admin-card-radius:/);
  assert.doesNotMatch(main, /FunnelStageIndex|추천 행동 퍼널/);
});

test("사용자 활동은 라이프로그 단계와 환경 미확인을 구분하고 QA 제어를 유지한다", () => {
  const at = "2026-11-01T16:00:00Z";
  const data: AdminUserActivityResponse = {
    periodDays: 7, generatedAt: at, trackingStartedAt: at,
    summary: { observedUsers: 1, newUsers: 1, returningUsers: 0, meaningfulUsers: 1,
      convertedUsers: 1, authenticatedUsers: 0, excludedUsers: 0 },
    daily: [], users: [{ userId: "test-user", displayName: null, accountType: "anonymous",
      stage: "converted", excluded: false, exclusionReason: null, platform: null,
      appVersion: null, sessionCount: 0, recommendationRuns: 0, recommendationActions: 0,
      journalCount: 1, createdAt: at, firstActivityAt: at, lastActivityAt: at }],
  };
  const html = renderToStaticMarkup(createElement(AdminUserActivityPanel, {
    data, days: 7, mutatingId: null, onDaysChange: () => {}, onToggleExcluded: () => {},
  }));
  assert.match(html, /라이프로그 이용 계정/);
  assert.match(html, /마디 작성/);
  assert.match(html, /미확인/);
  assert.doesNotMatch(html, /수집 전|>전환</);
  assert.match(html, /분석 제외/);
});
