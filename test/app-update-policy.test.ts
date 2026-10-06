import assert from "node:assert/strict";
import test from "node:test";
import {
  compareAppVersions,
  createAppUpdatePolicy,
  InvalidAppUpdateConfigurationError,
  InvalidAppVersionError,
} from "../src/server/appUpdate/appUpdatePolicy";

test("앱 버전의 각 숫자 구간을 비교한다", () => {
  assert.equal(compareAppVersions("1.4.0", "1.4"), 0);
  assert.equal(compareAppVersions("1.3.1", "1.4.0"), -1);
  assert.equal(compareAppVersions("1.10.0", "1.9.9"), 1);
});

test("최신 버전 설정이 없으면 업데이트 안내를 끈다", () => {
  const policy = createAppUpdatePolicy("android", "1.4.0", {});

  assert.equal(policy.updateAvailable, false);
  assert.equal(policy.required, false);
  assert.equal(policy.latestVersion, null);
  assert.equal(policy.storeUrl, null);
});

test("최신 버전보다 낮으면 권장 업데이트를 반환한다", () => {
  const policy = createAppUpdatePolicy("android", "1.4.0", {
    APP_UPDATE_ANDROID_LATEST_VERSION: "1.5.0",
  });

  assert.equal(policy.updateAvailable, true);
  assert.equal(policy.required, false);
  assert.equal(policy.latestVersion, "1.5.0");
  assert.match(policy.storeUrl ?? "", /play\.google\.com/);
});

test("최소 지원 버전보다 낮으면 필수 업데이트를 반환한다", () => {
  const policy = createAppUpdatePolicy("ios", "1.3.0", {
    APP_UPDATE_IOS_LATEST_VERSION: "1.5.0",
    APP_UPDATE_IOS_MINIMUM_VERSION: "1.4.0",
  });

  assert.equal(policy.updateAvailable, true);
  assert.equal(policy.required, true);
  assert.match(policy.storeUrl ?? "", /apps\.apple\.com/);
});

test("잘못된 앱 버전과 서버 설정을 거부한다", () => {
  assert.throws(
    () => createAppUpdatePolicy("android", "1.4.0-beta", {}),
    InvalidAppVersionError,
  );
  assert.throws(
    () =>
      createAppUpdatePolicy("android", "1.4.0", {
        APP_UPDATE_ANDROID_LATEST_VERSION: "latest",
      }),
    InvalidAppUpdateConfigurationError,
  );
});
