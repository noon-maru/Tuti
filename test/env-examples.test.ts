import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

// 고정 목록의 공개 예제만 읽는다. 실제 env 로드·Compose 실행은 하지 않는다.
const exampleFiles = [
  ".env.example", ".env.development.example", ".env.production.example", ".env.storage.example",
] as const;

async function examples() {
  return new Map(await Promise.all(exampleFiles.map(async file => {
    const values = new Map<string, string>();
    for (const match of (await readFile(file, "utf8")).matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)) {
      assert.equal(values.has(match[1]), false, `${file}: duplicate key ${match[1]}`);
      values.set(match[1], match[2].trim());
    }
    return [file, values] as const;
  })));
}

test("env 예제는 4종류로 나누고 동일 파일의 중복 키와 폐기 키를 금지한다", async () => {
  const files = await examples();
  assert.equal(files.size, 4);
  assert.equal(existsSync(".env.app.example"), false);
  assert.equal(existsSync(".env.android.development.example"), false);
  for (const values of files.values()) {
    for (const key of ["POSTHOG_API_KEY", "AUTH_APP_REVIEW_CODE", "TUTI_RELEASE"]) {
      assert.equal(values.has(key), false, key);
    }
  }
});

test("스토어 업데이트 설정은 운영 예제에만 남기고 오래된 버전을 고정하지 않는다", async () => {
  const files = await examples();
  for (const platform of ["ANDROID", "IOS"]) {
    for (const field of ["LATEST_VERSION", "MINIMUM_VERSION", "STORE_URL"]) {
      const key = `APP_UPDATE_${platform}_${field}`;
      for (const [file, values] of files) {
        if (file === ".env.production.example") assert.equal(values.get(key), "", key);
        else assert.equal(values.has(key), false, `${file}: ${key}`);
      }
    }
  }
});

test("개발 푸시와 외부 사용자 AI는 기본 비활성화하고 보호용 키는 유지한다", async () => {
  const files = await examples();
  for (const file of [".env.example", ".env.development.example", ".env.production.example"] as const) {
    const values = files.get(file)!;
    assert.equal(values.get("FCM_PUSH_ENABLED"), "false");
    assert.equal(values.get("TUTI_PERSONALIZATION_MODE"), "off");
    assert.equal(values.get("TUTI_USER_AI_PROFILING_ENABLED"), "false");
  }
  const common = files.get(".env.example")!;
  for (const key of ["AUTH_APP_REVIEW_EMAIL", "AUTH_APP_REVIEW_PASSWORD", "SENSITIVE_JOURNAL_WORKFLOW_ENABLED",
    "PRIVACY_REPLAY_HMAC_SECRET", "PRIVACY_REPLAY_LEDGER_PATH", "DEV_UID", "DEV_GID"]) {
    assert.equal(common.has(key), true, key);
  }
  assert.equal(files.get(".env.storage.example")!.size, 7);
});

test("앱 공개 설정은 Android·iOS Actions에 명시해 예제 삭제 후에도 유지한다", async () => {
  const files = await examples();
  const publicValues = [...files.get(".env.production.example")!].filter(([key]) => key.startsWith("NEXT_PUBLIC_"));
  assert.equal(publicValues.length, 8);
  for (const file of [".github/workflows/android-release.yml", ".github/workflows/ios-release.yml"]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /workflow_dispatch:/);
    for (const [key, value] of publicValues) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(source, new RegExp(`^\\s*${key}:\\s*["']?${escaped}["']?\\s*$`, "m"), `${file}: ${key}`);
    }
  }
});
