import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationSettingsScreen } from "../src/features/tuti/screens/notifications/NotificationSettingsScreen";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../src/shared/notifications/preferences";
test("알림 설정은 두 축과 기본 저녁 7시를 표시하며 표시 방식 세부 설정은 제거한다", () => {
  const html = renderToStaticMarkup(createElement(NotificationSettingsScreen, {
    settings: DEFAULT_NOTIFICATION_SETTINGS, supported: true, status: null, busy: false, message: null, onBack() {}, async onChange() {},
  }));
  assert.match(html, /함께 채우기·서비스 소식/); assert.match(html, /마디 기록 알림/);
  assert.match(html, /value="19:00"/); assert.equal((html.match(/role="switch"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /오늘의 Tuti|팝업으로|오늘의 공기/);
});
test("웹에서는 알림 미지원 안내와 비활성 제어를 표시한다", () => {
  const html = renderToStaticMarkup(createElement(NotificationSettingsScreen, {
    settings: DEFAULT_NOTIFICATION_SETTINGS, supported: false, status: null, busy: false, message: null, onBack() {}, async onChange() {},
  }));
  assert.match(html, /설치한 Tuti 앱/); assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
});
test("예제와 런타임에서 시험 사용자 허용 목록을 제거한다", () => {
  for (const file of [".env.example", ".env.production.example", ".env.development.example", "src/server/notifications/pushAccess.ts"])
    assert.doesNotMatch(readFileSync(file, "utf8"), /(?:FCM|APNS)_PUSH_TEST_EMAILS/);
});
