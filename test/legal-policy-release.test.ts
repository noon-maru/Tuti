import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import documents from "../src/shared/legal/finalizedDocuments.json";
import { FINAL_NOTICE_FILES, prepareFinalNoticeBundle } from "../src/server/legal/finalNoticeBundle";
import { configuredLegalPolicyRelease, getLegalPolicyRelease, parseLegalPolicyRelease, syncLegalPolicyRelease, subscribeLegalPolicyRelease } from "../src/shared/legal/policyRelease";
import { getLocationTerms, getLocationTermsVersion, LOCATION_TERMS_VERSION } from "../src/shared/location/terms";
import { getJournalPublicationPolicyVersion, isCurrentJournalPublicationPolicy, JOURNAL_PUBLICATION_POLICY_VERSION } from "../src/shared/legal/journalPublicationPolicy";
import { validateFinalizedTerms } from "../src/shared/legal/validateFinalizedTerms";

const release = { version: "2026-10-22", effectiveAt: "2026-10-22T00:00:00+09:00" } as const;

test("앱 포함 원문 네 개는 승인한 공고 생성물과 해시·전체 본문이 일치한다", () => {
  const read = (file: string) => readFileSync(file, "utf8");
  const prepared = prepareFinalNoticeBundle({
    sources: Object.fromEntries(Object.entries(FINAL_NOTICE_FILES).map(([kind, file]) => [kind, read("docs/legal/release/" + file)])) as Parameters<typeof prepareFinalNoticeBundle>[0]["sources"],
    serviceTermsDraft: read("docs/legal/service-terms-draft.md"),
    manifest: JSON.parse(read("docs/legal/release/review-manifest.json")),
    readiness: JSON.parse(read("docs/legal/readiness-status.json")),
  });
  assert.deepEqual(documents, Object.fromEntries(prepared.entries.map(entry => [entry.documentType, {
    version: entry.notice.version, documentHash: entry.documentHash, document: entry.notice.document,
  }])));
});

test("시행 시각만 설정해도 전환되지 않고 명시적 버전·실제 시행 시점이 필요하다", () => {
  assert.equal(configuredLegalPolicyRelease({ TUTI_LEGAL_POLICY_EFFECTIVE_AT: release.effectiveAt }), null);
  assert.deepEqual(configuredLegalPolicyRelease({ TUTI_LEGAL_POLICY_RELEASE: release.version, TUTI_LEGAL_POLICY_EFFECTIVE_AT: release.effectiveAt }, new Date("2026-10-22T01:00:00Z")), release);
  assert.throws(() => configuredLegalPolicyRelease({ TUTI_LEGAL_POLICY_RELEASE: release.version }));
  assert.throws(() => configuredLegalPolicyRelease({ TUTI_LEGAL_POLICY_RELEASE: release.version, TUTI_LEGAL_POLICY_EFFECTIVE_AT: release.effectiveAt }, new Date("2026-10-21T00:00:00Z")));
  assert.throws(() => parseLegalPolicyRelease({ ...release, version: "unknown" }));
});

test("구서버 앱은 기존 버전 유지, 서버 전환 후 문서와 위치·공개 동의 버전이 함께 전환된다", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  let updates = 0;
  const unsubscribe = subscribeLegalPolicyRelease(() => { updates++; });
  try {
    syncLegalPolicyRelease(undefined);
    updates = 0;
    assert.equal(getLegalPolicyRelease(), null);
    assert.equal(getLocationTermsVersion(), LOCATION_TERMS_VERSION);
    assert.equal(getJournalPublicationPolicyVersion(), JOURNAL_PUBLICATION_POLICY_VERSION);
    syncLegalPolicyRelease(release);
    assert.equal(updates, 1);
    assert.equal(getLocationTermsVersion(), release.version);
    assert.deepEqual(getLocationTerms().sections, documents["location-terms"].document.sections);
    assert.equal(getLocationTerms().effectiveDate, "2026년 10월 22일");
    assert.equal(isCurrentJournalPublicationPolicy(JOURNAL_PUBLICATION_POLICY_VERSION), false);
    assert.equal(isCurrentJournalPublicationPolicy("journal-publication-2026-10-22"), true);
    syncLegalPolicyRelease(release);
    assert.equal(updates, 1);
    assert.throws(() => syncLegalPolicyRelease({ version: "unknown", effectiveAt: release.effectiveAt }));
    assert.equal(getLocationTermsVersion(), release.version);
  } finally {
    syncLegalPolicyRelease(null);
    unsubscribe();
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("동일 확정 버전의 다른 해시·다른 본문에는 동의할 수 없다", () => {
  const offer = documents["service-terms"];
  assert.doesNotThrow(() => validateFinalizedTerms({ current: offer }));
  assert.throws(() => validateFinalizedTerms({ current: { ...offer, documentHash: "a".repeat(64) } }));
  assert.throws(() => validateFinalizedTerms({ current: { ...offer, document: { ...offer.document, summary: "다른 원문" } } }));
  assert.doesNotThrow(() => validateFinalizedTerms({ current: null }));
});
