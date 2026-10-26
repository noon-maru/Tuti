import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import documents from "../src/shared/legal/finalizedDocuments.json";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { validateDevelopmentLegalSource } = await import("../scripts/setup-development-legal");
const time = "2020-01-01T00:00:00.000Z";
const current = { ...documents["service-terms"], accepted: false, publishedAt: time, effectiveAt: time };
const notices = (["privacy", "location-terms", "community-guidelines"] as const).map(documentType => ({
  ...documents[documentType], documentType, publishedAt: time, plannedEffectiveAt: time, applicationPolicy: "개발 검증용 공개 원문 사본",
}));

test("운영 공개 약관 복사본은 확정 원문·버전·해시·시행일을 검증한다", () => {
  assert.doesNotThrow(() => validateDevelopmentLegalSource(current, notices));
  assert.throws(() => validateDevelopmentLegalSource({ ...current, documentHash: "a".repeat(64) }, notices));
  assert.throws(() => validateDevelopmentLegalSource({ ...current, effectiveAt: "2099-01-01T00:00:00Z" }, notices));
  assert.throws(() => validateDevelopmentLegalSource(current, notices.slice(1)));
  assert.throws(() => validateDevelopmentLegalSource(current, [...notices.slice(1), notices[1]]));
  assert.throws(() => validateDevelopmentLegalSource(current, notices.map((row, i) => i === 0 ? { ...row, document: { ...row.document, title: "다른 원문" } } : row)));
});

test("개발 초기화는 승인 계정·관리자 보존·운영 객체 대조를 요구하고 트리거를 끄지 않는다", () => {
  const source = readFileSync("scripts/setup-development-legal.ts", "utf8");
  assert.match(source, /TUTI_INSPECTION_ENV === "development"/);
  assert.match(source, /APPROVED_ACCOUNT_LIST_CHANGED/);
  assert.match(source, /ADMIN_PRESERVATION_CHECK_FAILED/);
  assert.match(source, /protectedAssets\.has\(digest\(harumadiPdf.objectKey\)\)/);
  assert.match(source, /EXTERNAL_IDENTITY_REVOCATION_REQUIRES_REVIEW/);
  assert.match(source, /deleteOrdinaryTestAccount\(user.id, cutoff\)/);
  assert.doesNotMatch(source, /DISABLE TRIGGER|session_replication_role|TRUNCATE|serviceTermsAcceptance\.create/);
  const wrapper = "scripts/ops/tuti-dev-legal-setup";
  assert.equal(spawnSync("sh", ["-n", wrapper]).status, 0);
  const shell = readFileSync(wrapper, "utf8");
  assert.match(shell, /default_transaction_read_only=on/);
  assert.match(shell, /docker-compose.dev.yml up -d --no-deps --force-recreate app/);
  assert.doesNotMatch(shell, /docker-compose.prod.yml.*(?:up|restart|run)/);
});
