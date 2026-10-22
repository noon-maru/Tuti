import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.SERVICE_TERMS_WORKFLOW_ENABLED = "false";
process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED = "false";
const document = { title: "서비스 이용약관", summary: "다음 이용을 위한 안내", importantTerms: ["새 약관에 명시적으로 동의해주세요."], sections: [{ title: "이용", paragraphs: ["기록과 기록집 이용"] }] };
const now = new Date("2026-10-22T00:00:00Z");
let row: Record<string, unknown> | null = null;
(globalThis as { prisma?: unknown }).prisma = {
  legalDocumentNotice: { findFirst: async ({ where }: { where: { documentType: string } }) => where.documentType === "service-terms" ? row : null },
  serviceTermsRelease: { findFirst: () => { throw new Error("공고 조회는 시행 원문에 접근하지 않는다"); } },
};
const { hashServiceTerms } = await import("@/server/legal/serviceTerms");
const { LEGAL_NOTICE_CHECKS, prepareLegalDocumentNotice } = await import("@/server/legal/documentNotice");
const { prepareServiceTermsRelease, RELEASE_READINESS_CHECKS } = await import("@/server/legal/releaseApproval");
const { GET } = await import("@/app/api/public/legal-notices/route");
const { fetchLegalDocumentNotices } = await import("@/lib/legalDocumentNotices");
const documentHash = hashServiceTerms(document);
const evidence = { owner: "운영자", contact: "admin@example.test", backupRetentionDays: 30, approvedDocumentHash: documentHash,
  checks: Object.fromEntries(LEGAL_NOTICE_CHECKS.map(key => [key, { confirmed: true, reference: "NOTICE-APPROVAL-123" }])) };
const input = { documentType: "service-terms", version: "2026-10-22", document, publicationMode: "initial", plannedEffectiveAt: "2026-10-23T00:00:00Z", approvalReference: "NOTICE-APPROVAL-123", applicationPolicy: "다음 앱·서버 전환 후 이용자별 명시적 동의를 요청합니다." };

test("공고 승인과 시행 조건을 분리하고 최종 승인 없는 원문·일정은 거절한다", () => {
  const notice = prepareLegalDocumentNotice(input, evidence, now);
  assert.equal(notice.documentHash, documentHash);
  assert.equal(notice.publishedAt, now);
  assert.equal("initialContractReference" in notice, false);
  assert.equal(evidence.checks.nativeClientRollout, undefined, "공고에 앱 출시 확인을 요구하지 않는다");
  assert.throws(() => prepareLegalDocumentNotice(input, { ...evidence, approvedDocumentHash: null }, now), /approvedDocumentHashMissing/);
  assert.throws(() => prepareLegalDocumentNotice(input, { ...evidence, checks: {} }, now), /승인 미확인/);
  assert.throws(() => prepareLegalDocumentNotice({ ...input, plannedEffectiveAt: "2026-10-21" }, evidence, now), /예정일/);
  assert.throws(() => prepareLegalDocumentNotice({ ...input, publicationMode: "amendment" }, evidence, now), /30일/);
  assert.throws(() => prepareLegalDocumentNotice({ ...input, applicationPolicy: "미확정" }, evidence, now), /확정/);
});

test("확정한 네 문서 준비 묶음은 실제 공고 검증기를 통과하되 등록·동의를 생성하지 않는다", async () => {
  const { FINAL_NOTICE_FILES, prepareFinalNoticeBundle } = await import("../src/server/legal/finalNoticeBundle");
  const sources = Object.fromEntries(Object.entries(FINAL_NOTICE_FILES).map(([kind, file]) => [kind, readFileSync("docs/legal/release/" + file, "utf8")])) as Parameters<typeof prepareFinalNoticeBundle>[0]["sources"];
  const bundle = prepareFinalNoticeBundle({ sources,
    serviceTermsDraft: readFileSync("docs/legal/service-terms-draft.md", "utf8"),
    manifest: JSON.parse(readFileSync("docs/legal/release/review-manifest.json", "utf8")),
    readiness: JSON.parse(readFileSync("docs/legal/readiness-status.json", "utf8")),
    now, effectiveAt: "2026-11-21T00:00:00Z",
  });
  for (const item of bundle.entries) {
    const prepared = prepareLegalDocumentNotice(item.notice, item.readiness, now);
    assert.equal(prepared.documentHash, item.documentHash);
    assert.equal(prepared.documentType, item.documentType);
    assert.equal(prepared.publishedAt.toISOString(), now.toISOString());
  }
  assert.equal(bundle.announcementApplied, false);
  assert.equal(row, null);
});

test("공고 원문은 강제 기능·인증 없이 열람하되 동의·시행 데이터와 내부 승인번호는 노출하지 않는다", async () => {
  row = prepareLegalDocumentNotice(input, evidence, now);
  const response = await GET(new Request("https://tuti.today/api/public/legal-notices"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.notices[0].documentHash, documentHash);
  assert.equal(body.notices[0].applicationPolicy, input.applicationPolicy);
  assert.doesNotMatch(JSON.stringify(body), /NOTICE-APPROVAL-123|accepted|userId/);
  row.documentHash = "b".repeat(64);
  assert.equal((await GET(new Request("https://tuti.today/api/public/legal-notices"))).status, 503);
  assert.equal((await GET(new Request("https://tuti.today/api/public/legal-notices", { headers: { Origin: "https://external.invalid" } }))).status, 403);
});

test("시행은 별도 승인을 요구하며 공고 해시·공고일부터의 기간·예정일을 유지한다", () => {
  const notice = prepareLegalDocumentNotice({ ...input, publicationMode: "amendment", plannedEffectiveAt: "2026-11-21T00:00:00Z" }, evidence, now);
  const releaseInput = { version: input.version, document, effectiveAt: "2026-11-21T00:00:00Z", approvalReference: input.approvalReference,
    readiness: Object.fromEntries(RELEASE_READINESS_CHECKS.map(key => [key, true])) };
  const release = prepareServiceTermsRelease(releaseInput, new Date("2026-11-21"), notice);
  assert.equal(release.publishedAt, now, "시행 시각부터 공고 기간을 다시 세지 않는다");
  assert.throws(() => prepareServiceTermsRelease({ ...releaseInput, readiness: {} }, now, notice), /완료되지/);
  assert.throws(() => prepareServiceTermsRelease(releaseInput, now, { ...notice, documentHash: "changed" }), /공고된/);
  assert.throws(() => prepareServiceTermsRelease(releaseInput, now, { ...notice, plannedEffectiveAt: new Date("2026-11-22") }), /앞당기지/);
});

test("공고 페이지는 계정 없는 읽기 전용 요청을 쓰며 구서버·장애·문서 종류를 구분한다", async t => {
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("Authorization"), null);
    assert.equal(init?.credentials, "omit");
    return Response.json({ notices: [] });
  });
  assert.deepEqual(await fetchLegalDocumentNotices(), []);
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  assert.deepEqual(await fetchLegalDocumentNotices(), []);
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  await assert.rejects(fetchLegalDocumentNotices);
  t.mock.method(globalThis, "fetch", async () => Response.json({ notices: [{ documentType: "unknown" }] }));
  await assert.rejects(fetchLegalDocumentNotices);
  assert.match(readFileSync("src/features/legal/LegalDocument.tsx", "utf8"), /\/legal\/notices/);
});
