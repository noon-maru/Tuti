import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminEngagementMetricsPanel, formatActiveSeconds } from "../src/features/admin/AdminEngagementMetricsPanel";
import type { EngagementMetrics } from "../src/shared/api/engagementMetrics";

const fixture = (): EngagementMetrics => ({
  coverage: { activeUsers: 6, lifecycleUsers: 2, legacyOnlyUsers: 4, measuredUsers: 0, rate: 0, measuredSince: null },
  sessions: { observed: 2, measured: 0, incomplete: 0, meanSeconds: null, medianSeconds: null, p90Seconds: null, shortSessions: 0, observedSpanSessions: 2, observedSpanMeanSeconds: 600.3 },
  distribution: [{ label: "10초 미만", sessions: 0 }],
  retention: [{ day: 1, eligible: 0, returned: 0, pending: 2, rate: null }, { day: 7, eligible: 0, returned: 0, pending: 2, rate: null }, { day: 30, eligible: 0, returned: 0, pending: 2, rate: null }],
  cohorts: [{ day: "2026-10-30", users: 2, d1: null, d7: null, d30: null }],
  environments: [{ platform: "android", appVersion: "1.6.1 (16)", users: 2, measuredUsers: 0, measuredSessions: 0, meanSeconds: null, medianSeconds: null }],
});
const render = (data?: EngagementMetrics) => renderToStaticMarkup(createElement(AdminEngagementMetricsPanel, { data }));

test("구형 6계정과 새 계측 2계정을 구분하고 10분 활동 간격을 활성 시간으로 가장하지 않는다", () => {
  const markup = render(fixture());
  assert.match(markup, /<dt>활동 계정<\/dt><dd>6<\/dd>/);
  assert.match(markup, /<dt>새 활동 계측 계정<\/dt><dd>2<\/dd>/);
  assert.match(markup, /<dt>기존 로그만 있는 계정<\/dt><dd>4<\/dd>/);
  assert.match(markup, /<dt>평균<\/dt><dd>미계측<\/dd>/);
  assert.match(markup, /<dt>관측 활동 구간 평균<\/dt><dd>10분<\/dd>/);
  assert.match(markup, /집계 중/);
  assert.match(markup, /1.6.1 \(16\)/);
  assert.doesNotMatch(markup, /<dd>0초<\/dd>/);
  assert.match(render(), /미계측/);
});

test("활성 평균·분포·표본 수를 표시하고 확정된 0%와 미성숙을 구분한다", () => {
  const data = fixture();
  data.coverage.measuredSince = "2026-11-02T00:00:00Z";
  data.coverage.measuredUsers = 1;
  data.sessions = { ...data.sessions, measured: 2, meanSeconds: 90, medianSeconds: 60, p90Seconds: 120, shortSessions: 1 };
  data.retention[0] = { day: 1, eligible: 2, returned: 0, pending: 0, rate: 0 };
  const markup = render(data);
  assert.match(markup, /활성 체류 시간 · 측정 2 \/ 관측 2세션/);
  assert.match(markup, /1분 30초/);
  assert.match(markup, /<dt>D1 재방문<\/dt><dd>0%<\/dd>/);
  assert.match(markup, /<dt>D7 재방문<\/dt><dd>집계 중<\/dd>/);
  assert.match(markup, /<dt>10초 미만 활성 세션<\/dt><dd>50%<\/dd>/);
  assert.equal(formatActiveSeconds(59.6), "1분");
  assert.equal(formatActiveSeconds(null), "미계측");
});
