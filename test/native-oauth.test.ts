import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeOAuthCallbackUrl,
  readNativeOAuthCallback,
} from "../src/shared/auth/nativeOAuth";

test("네이티브 OAuth 완료 URL을 앱 딥링크로 만든다", () => {
  assert.equal(
    createNativeOAuthCallbackUrl("oauthTicket", "ticket-value"),
    "com.noonmaru.tuti://oauth/callback?oauthTicket=ticket-value",
  );
});

test("네이티브 OAuth 딥링크를 로그인 완료 경로로 변환한다", () => {
  assert.equal(
    readNativeOAuthCallback(
      "com.noonmaru.tuti://oauth/callback?oauthTicket=ticket-value",
    ),
    "/login?oauthTicket=ticket-value",
  );
  assert.equal(
    readNativeOAuthCallback(
      "com.noonmaru.tuti://oauth/callback?oauthError=access_denied",
    ),
    "/login?oauthError=access_denied",
  );
});

test("다른 앱이나 경로의 딥링크는 OAuth 콜백으로 처리하지 않는다", () => {
  assert.equal(
    readNativeOAuthCallback(
      "other.app://oauth/callback?oauthTicket=ticket-value",
    ),
    null,
  );
  assert.equal(
    readNativeOAuthCallback(
      "com.noonmaru.tuti://other/callback?oauthTicket=ticket-value",
    ),
    null,
  );
});
