import assert from "node:assert/strict";
import test from "node:test";
import { calculateBusinessMetrics } from "../src/server/admin/businessMetrics";

const at = (value: string) => new Date(value);

test("사업 지표는 한국 날짜 기준 활성·재방문·단계 전환을 계산한다", () => {
  const users = [
    { id: "u1", createdAt: at("2026-09-01T03:00:00Z"), authenticated: true },
    { id: "u2", createdAt: at("2026-09-08T03:00:00Z"), authenticated: false },
    { id: "u3", createdAt: at("2026-08-20T03:00:00Z"), authenticated: true },
    { id: "u4", createdAt: at("2026-09-10T03:00:00Z"), authenticated: false },
  ];
  const sessions = [
    { userId: "u1", platform: "ios" as const, createdAt: at("2026-09-10T15:30:00Z") },
    { userId: "u2", platform: "web" as const, createdAt: at("2026-09-09T02:00:00Z") },
    { userId: "u2", platform: "web" as const, createdAt: at("2026-09-11T01:00:00Z") },
    { userId: "u3", platform: "android" as const, createdAt: at("2026-09-01T01:00:00Z") },
  ];
  const response = calculateBusinessMetrics({
    now: at("2026-09-11T03:00:00Z"),
    periodDays: 30,
    trackingStartedAt: at("2026-08-20T03:00:00Z"),
    users,
    sessions,
    firstSessions: [
      { userId: "u1", createdAt: sessions[0].createdAt },
      { userId: "u2", createdAt: sessions[1].createdAt },
      { userId: "u3", createdAt: sessions[3].createdAt },
    ],
    productEvents: [
      { userId: "u1", action: "entry_completed", createdAt: sessions[0].createdAt },
      { userId: "u2", action: "entry_completed", createdAt: sessions[2].createdAt },
    ],
    recommendationRuns: [
      { userId: "u1", createdAt: sessions[0].createdAt },
      { userId: "u2", createdAt: sessions[2].createdAt },
    ],
    recommendationActions: [
      { userId: "u1", action: "place_selected", createdAt: sessions[0].createdAt },
      { userId: "u2", action: "place_selected", createdAt: sessions[2].createdAt },
      { userId: "u1", action: "departure_peek_opened", createdAt: sessions[0].createdAt },
      { userId: "u1", action: "navigation_started", createdAt: sessions[0].createdAt },
      { userId: "u1", action: "return_confirmed", createdAt: sessions[0].createdAt },
    ],
  });

  assert.deepEqual(response.audience, {
    dau: 2,
    wau: 2,
    mau: 3,
    dauMauRate: 66.7,
    newUsers30d: 4,
    returningUsers30d: 1,
    returnRate30d: 33.3,
    authenticatedMau: 2,
    authenticatedMauRate: 66.7,
  });
  assert.deepEqual(
    response.stages.map((stage) => [stage.key, stage.users]),
    [
      ["active", 3],
      ["intake", 2],
      ["recommended", 2],
      ["selected", 2],
      ["departure", 1],
      ["navigation", 1],
      ["converted", 1],
    ],
  );
  assert.deepEqual(
    response.platforms.map((platform) => [platform.platform, platform.users]),
    [["web", 1], ["android", 1], ["ios", 1]],
  );
  assert.deepEqual(response.daily.at(-1), {
    date: "2026-09-11",
    activeUsers: 2,
    newUsers: 0,
    returningUsers: 1,
  });
});

test("재방문 코호트는 완료된 주차만 확정 비율을 낸다", () => {
  const response = calculateBusinessMetrics({
    now: at("2026-09-11T03:00:00Z"),
    periodDays: 30,
    trackingStartedAt: at("2026-08-24T03:00:00Z"),
    users: [
      { id: "returner", createdAt: at("2026-08-24T03:00:00Z"), authenticated: false },
      { id: "current", createdAt: at("2026-09-08T03:00:00Z"), authenticated: false },
    ],
    sessions: [
      { userId: "returner", platform: "web", createdAt: at("2026-08-24T03:00:00Z") },
      { userId: "returner", platform: "web", createdAt: at("2026-09-01T03:00:00Z") },
      { userId: "current", platform: "ios", createdAt: at("2026-09-08T03:00:00Z") },
    ],
    firstSessions: [
      { userId: "returner", createdAt: at("2026-08-24T03:00:00Z") },
      { userId: "current", createdAt: at("2026-09-08T03:00:00Z") },
    ],
    productEvents: [],
    recommendationRuns: [],
    recommendationActions: [],
  });

  const completed = response.cohorts.find(
    (cohort) => cohort.cohortWeek === "2026-08-24",
  );
  const current = response.cohorts.find(
    (cohort) => cohort.cohortWeek === "2026-09-07",
  );
  assert.deepEqual(completed?.retention.slice(0, 3), [100, 100, null]);
  assert.deepEqual(current?.retention, [100, null, null, null, null]);
});
