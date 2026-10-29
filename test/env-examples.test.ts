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

function exampleSections(source: string) {
  const headings = [...source.matchAll(/^# -+\r?\n# ([^\r\n]+)\r?\n# -+\r?$/gm)];
  return new Map(headings.map((heading, index) => [heading[1], source.slice(
    heading.index + heading[0].length, headings[index + 1]?.index ?? source.length,
  )]));
}

test("env 예제는 4종류로 나누고 동일 파일의 중복 키와 폐기 키를 금지한다", async () => {
  const files = await examples();
  assert.equal(files.size, 4);
  assert.equal(existsSync(".env.app.example"), false);
  assert.equal(existsSync(".env.android.development.example"), false);
  for (const values of files.values()) {
    for (const key of ["POSTHOG_API_KEY", "AUTH_APP_REVIEW_CODE", "TUTI_RELEASE",
      "JOURNAL_SHARE_TRACE_SECRET", "NEXT_PUBLIC_JOURNAL_PUBLICATION_ENABLED",
      "NEXT_PUBLIC_JOURNAL_PUBLICATION_AUDIENCE", "SENSITIVE_JOURNAL_WORKFLOW_ENABLED"]) {
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
  for (const key of ["AUTH_APP_REVIEW_EMAIL", "AUTH_APP_REVIEW_PASSWORD", "MADI_SHARE_TRACE_SECRET", "SENSITIVE_MADI_WORKFLOW_ENABLED",
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

test("운영 법률 설정은 DB 초기화 이후 별도로 모으고 시행·민감정보 키를 포함한다", async () => {
  const files = await examples();
  const production = files.get(".env.production.example")!;
  const source = await readFile(".env.production.example", "utf8");
  const databaseEnd = source.indexOf("POSTGRES_DB=");
  for (const key of ["SERVICE_TERMS_WORKFLOW_ENABLED", "SERVICE_TERMS_ENFORCEMENT_ENABLED",
    "LEGAL_RIGHTS_WORKFLOW_ENABLED", "PRIVACY_REPLAY_LEDGER_ENABLED",
    "PRIVACY_EXTENDED_RETENTION_ENABLED", "SENSITIVE_MADI_WORKFLOW_ENABLED"]) {
    assert.equal(production.get(key), "false", key);
    assert.ok(source.indexOf(`\n${key}=`) > databaseEnd, key);
  }
  for (const key of ["TUTI_LEGAL_POLICY_RELEASE", "TUTI_LEGAL_POLICY_EFFECTIVE_AT",
    "LEGAL_RIGHTS_ALERT_WEBHOOK_URL", "PRIVACY_REPLAY_HMAC_SECRET"]) {
    assert.equal(production.get(key), "", key);
    assert.ok(source.indexOf(`\n${key}=`) > databaseEnd, key);
  }
});

test("공통·운영 예제는 법률 설정의 용도별 구분과 공통 기본값을 맞춘다", async () => {
  const files = await examples();
  const titles = ["약관 공개·동의·시행", "공개 기록 권리 보호", "삭제·철회 복원 방지 원장",
    "개인정보 보관기한 정리", "민감정보 기록 보호"];
  const groups = await Promise.all([".env.example", ".env.production.example"].map(async file => {
    const source = await readFile(file, "utf8");
    return new Map([...exampleSections(source)].map(([title, section]) => [
      title, [...section.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(match => match[1]),
    ]));
  }));
  const common = files.get(".env.example")!;
  const production = files.get(".env.production.example")!;
  for (const title of titles) {
    const commonKeys = groups[0].get(title);
    const productionKeys = groups[1].get(title);
    assert.ok(commonKeys?.length, title);
    assert.ok(productionKeys?.length, title);
    for (const key of productionKeys) {
      assert.ok(commonKeys.includes(key), `${title}: ${key}`);
      assert.equal(common.get(key), production.get(key), key);
    }
  }
});

test("개발 예제는 웹·로그인 UI·개인화·푸시·DB 설정을 분리한다", async () => {
  const source = await readFile(".env.development.example", "utf8");
  const sections = exampleSections(source);
  for (const [title, key] of [
    ["개발 웹 API", "NEXT_PUBLIC_API_BASE_URL"],
    ["개발 로그인 UI", "NEXT_PUBLIC_ACCOUNT_AUTH_ENABLED"],
    ["추천 개인화·사용자 AI", "TUTI_PERSONALIZATION_MODE"],
    ["개발 서버 푸시", "FCM_PUSH_ENABLED"],
    ["개발 애플리케이션 DB 연결", "DATABASE_URL"],
    ["개발 PostgreSQL 컨테이너 초기화", "POSTGRES_USER"],
  ]) {
    const section = sections.get(title);
    assert.ok(section?.includes(`\n${key}=`), `${title}: ${key}`);
  }
});
