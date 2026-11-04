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
test("미지원 환경에서는 대체 안내와 비활성 제어를 표시한다", () => {
  const html = renderToStaticMarkup(createElement(NotificationSettingsScreen, {
    settings: DEFAULT_NOTIFICATION_SETTINGS, supported: false, status: null, busy: false, message: null, onBack() {}, async onChange() {},
  }));
  assert.match(html, /지원 브라우저/); assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
});
test("웹·PWA는 지원·HTTPS·iPhone 홈 화면 설치·권한 차단을 구분한다", () => {
  for (const browser of ["supported", "install-required", "insecure", "unsupported"] as const) {
    const html = renderToStaticMarkup(createElement(NotificationSettingsScreen, {
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, newsEnabled: true }, supported: browser === "supported", browser,
      status: { supported: browser === "supported", permission: browser === "supported" ? "denied" : "unsupported", registered: false },
      busy: false, message: null, onBack() {}, async onChange() {},
    }));
    assert.match(html, browser === "supported" ? /이 브라우저에서도 알림 받기/ : browser === "install-required" ? /홈 화면에 추가/ : browser === "insecure" ? /HTTPS/ : /지원하지 않아요/);
    if (browser === "supported") assert.match(html, /사이트 설정에서 Tuti 알림을 허용/);
  }
});
test("예제와 런타임에서 시험 사용자 허용 목록을 제거한다", () => {
  for (const file of [".env.example", ".env.production.example", ".env.development.example", "src/server/notifications/pushAccess.ts"])
    assert.doesNotMatch(readFileSync(file, "utf8"), /(?:FCM|APNS)_PUSH_TEST_EMAILS/);
});
