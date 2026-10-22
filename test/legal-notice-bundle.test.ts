import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { FINAL_NOTICE_FILES, prepareFinalNoticeBundle } from "../src/server/legal/finalNoticeBundle";

function fixture() {
  const root = "docs/legal/release/";
  return {
    sources: Object.fromEntries(Object.entries(FINAL_NOTICE_FILES).map(([kind, file]) => [kind, readFileSync(root + file, "utf8")])) as Parameters<typeof prepareFinalNoticeBundle>[0]["sources"],
    serviceTermsDraft: readFileSync("docs/legal/service-terms-draft.md", "utf8"),
    manifest: JSON.parse(readFileSync(root + "review-manifest.json", "utf8")),
    readiness: JSON.parse(readFileSync("docs/legal/readiness-status.json", "utf8")),
    now: new Date("2026-10-22T00:00:00Z"),
  };
}

test("일정 없는 준비 묶음은 네 공고 원문·개별 승인 해시를 만들고 시행하지 않는다", () => {
  const result = prepareFinalNoticeBundle(fixture());
  assert.equal(result.entries.length, 4);
  assert.equal(result.scheduled, false);
  for (const key of ["announcementApplied", "enforcementApplied", "accountsDeleted", "legalComplianceCertified"] as const) assert.equal(result[key], false);
  for (const item of result.entries) {
    assert.equal("plannedEffectiveAt" in item.notice, false);
    assert.equal(item.readiness.approvedDocumentHash, item.documentHash);
    assert.equal(item.notice.approvalReference, "LEGAL-TEXT-DECISION-20261022");
    assert.equal(item.notice.publicationMode, "amendment");
    assert.match(item.notice.applicationPolicy, /새 앱 출시 후 서버 전환/);
    assert.match(item.notice.applicationPolicy, /자동 활성화하지 않습니다/);
  }
  const privacy = result.entries.find(item => item.documentType === "privacy")!.notice.document;
  const copy = JSON.stringify(privacy);
  for (const item of ["이전 국가·범위", "근거", "Google", "Apple", "Cloudflare", "180일", "제15조제1항제6호"]) assert.ok(copy.includes(item), item);
  assert.doesNotMatch(copy, /\| ---/);
});

test("실제 공고 시각을 앞당겨 꾸미거나 30일 미만·오타 일정·무승인 원문을 허용하지 않는다", () => {
  const base = fixture();
  assert.throws(() => prepareFinalNoticeBundle({ ...base, effectiveAt: "2026-11-20T23:59:59Z" }), /30_DAYS/);
  assert.throws(() => prepareFinalNoticeBundle({ ...base, effectiveAt: "2026-11-23" }), /DATE/);
  const planned = prepareFinalNoticeBundle({ ...base, effectiveAt: "2026-11-21T09:00:00+09:00" });
  assert.equal(planned.scheduled, true);
  for (const entry of planned.entries) assert.equal(entry.notice.plannedEffectiveAt, "2026-11-21T00:00:00.000Z");
  const changed = fixture();
  changed.sources.privacy += "\n공고 원문 변경";
  assert.throws(() => prepareFinalNoticeBundle(changed), /SOURCE_CHANGED/);
  const unsigned = fixture();
  unsigned.manifest.operatorFinalApproval = false;
  assert.throws(() => prepareFinalNoticeBundle(unsigned), /APPROVAL_REQUIRED/);
  const pending = fixture();
  pending.readiness.checks.finalDocumentApproval.confirmed = false;
  assert.throws(() => prepareFinalNoticeBundle(pending), /NOT_READY/);
});

test("준비 명령은 DB 없이 실행 가능하며 적용·임의 입력 파일·중복 옵션은 거부한다", () => {
  for (const args of [["--apply"], ["--file=.env.production"], ["--effective-at="], ["--effective-at=2026-11-30T00:00:00Z", "--effective-at=2026-11-30T00:00:00Z"]]) {
    const child = spawnSync(process.execPath, ["--import", "tsx", "scripts/prepare-legal-notice-bundle.ts", ...args], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /지원 옵션/);
    assert.equal(child.stdout, "");
  }
  const child = spawnSync(process.execPath, ["--import", "tsx", "scripts/prepare-legal-notice-bundle.ts"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
  assert.equal(child.status, 0, child.stderr);
  const prepared = JSON.parse(child.stdout);
  assert.equal(prepared.entries.length, 4);
  assert.equal(prepared.announcementApplied, false);
});
