import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminNotificationsPanel } from "../src/features/admin/AdminNotificationsPanel";
import type { AdminNotificationsResponse } from "../src/shared/api/admin";
test("운영자 화면은 권한 관측과 종류별 제공자 전송을 실제 열람과 구분한다", () => {
  const data: AdminNotificationsResponse = {
    generatedAt: "2026-11-03T10:00:00Z", configuration: { android: { enabled: true }, ios: { enabled: false } },
    summary: { totalDevices: 0, activeDevices: 0, activeUsers: 0, invalidatedDevices: 0, sent24h: 0, failed24h: 0, successRate: null, lastSentAt: null },
    platforms: [], errors: [], devices: [], recent: [],
    lifelog: { newsUsers: 2, reminderUsers: 1, mutedBooks: 0, pending: 0, opened24h: 0, written24h: 0,
      permissionRequestedUsers24h: 0, permissionGrantedUsers24h: 0, permissionDeniedUsers24h: 0, disabledUsers24h: 0,
      lastDispatchAt: null, lastDispatchFailed: 0, kinds: [{ kind: "madi-reminder", sent: 0, failed: 0 }] },
  };
  const html = renderToStaticMarkup(createElement(AdminNotificationsPanel, { data }));
  for (const label of ["소식 수신 계정", "기록 알림 계정", "제공자 전송 성공률", "권한 거절 확인", "오늘의 마디 기록 알림", "예약 발송기 실행 상태"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /내부 테스트|전달 성공률/);
});
