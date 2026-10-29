import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { madiShareTraceSecret, preferMadiEnvironmentValue } from "../src/shared/madi/environment";

test("마디 플래그는 새 이름의 false·빈 값도 우선하고 미설정만 이전 이름으로 읽는다", () => {
  assert.equal(preferMadiEnvironmentValue("false", "true"), "false");
  assert.equal(preferMadiEnvironmentValue("internal", "public"), "internal");
  assert.equal(preferMadiEnvironmentValue("", "true"), "");
  assert.equal(preferMadiEnvironmentValue(undefined, "true"), "true");
  assert.equal(preferMadiEnvironmentValue(undefined, undefined), undefined);
});

test("공유 서명키의 새 이름·이전 이름·인증키 대체 순서를 유지한다", () => {
  const legacy = "legacy-share-secret-".repeat(3);
  const current = "current-share-secret-".repeat(3);
  const auth = "fallback-auth-secret-".repeat(3);
  assert.equal(madiShareTraceSecret({ JOURNAL_SHARE_TRACE_SECRET: legacy }), legacy);
  assert.equal(madiShareTraceSecret({ MADI_SHARE_TRACE_SECRET: legacy }), legacy);
  assert.equal(madiShareTraceSecret({ MADI_SHARE_TRACE_SECRET: current, JOURNAL_SHARE_TRACE_SECRET: legacy }), current);
  assert.equal(madiShareTraceSecret({ MADI_SHARE_TRACE_SECRET: " ", JOURNAL_SHARE_TRACE_SECRET: legacy }), legacy);
  assert.equal(madiShareTraceSecret({ AUTH_EMAIL_CODE_SECRET: auth }), auth);
  assert.equal(madiShareTraceSecret({}), undefined);
});

test("환경변수 이름 변경으로 과거 공유 서명 입력과 원본 테이블 이름을 바꾸지 않는다", async () => {
  const source = await readFile("src/server/journal/shareTrace.ts", "utf8");
  assert.match(source, /tuti-journal-share-v1/);
  assert.match(source, /madiShareTraceSecret\(process.env\)/);
  const schema = await readFile("prisma/schema.prisma", "utf8");
  assert.match(schema, /journal_share_traces/);
});

test("공개 플래그는 Next 정적 치환 가능한 직접 참조를, 민감정보는 이전 플래그 호환을 유지한다", async () => {
  const release = await readFile("src/shared/features/release.ts", "utf8");
  for (const key of ["NEXT_PUBLIC_MADI_PUBLICATION_ENABLED", "NEXT_PUBLIC_MADI_PUBLICATION_AUDIENCE"]) {
    assert.ok(release.includes(`process.env.${key}`), key);
  }
  const sensitive = await readFile("src/server/journal/sensitivePolicy.ts", "utf8");
  assert.match(sensitive, /preferMadiEnvironmentValue\(/);
  assert.match(sensitive, /process.env.SENSITIVE_MADI_WORKFLOW_ENABLED, process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED/);
});

test("웹 Actions·Docker·앱 빌더도 새 공개 키를 사용하고 Compose는 이전 설정을 호환한다", async () => {
  const dockerfile = await readFile("Dockerfile", "utf8");
  const compose = await readFile("docker-compose.prod.yml", "utf8");
  const workflow = await readFile(".github/workflows/web-production-deploy.yml", "utf8");
  const builder = await readFile("scripts/build-capacitor-app.ts", "utf8");
  for (const [field, fallback, value] of [["ENABLED", "false", "true"], ["AUDIENCE", "internal", "public"]]) {
    const key = `NEXT_PUBLIC_MADI_PUBLICATION_${field}`;
    const legacy = `NEXT_PUBLIC_JOURNAL_PUBLICATION_${field}`;
    assert.ok(dockerfile.includes(`ARG ${key}=${fallback}`));
    assert.ok(dockerfile.includes(`ENV ${key}=$${key}`));
    const substitution = "${" + key + "-${" + legacy + ":-" + fallback + "}}";
    assert.equal(compose.split(`${key}: ${substitution}`).length - 1, 2);
    assert.equal(workflow.split(`${key}=${value}`).length - 1, 2);
    assert.ok(builder.includes(`process.env.${key}?.trim() ??`));
    assert.ok(builder.includes(`process.env.${legacy}?.trim() ??`));
  }
});
