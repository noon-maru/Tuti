import documents from "./finalizedDocuments.json";

export const JOURNAL_PUBLICATION_POLICY_VERSION = "journal-publication-2026-10-22";
export function getJournalPublicationPolicyVersion() { return JOURNAL_PUBLICATION_POLICY_VERSION; }

// 공개 기능 자체의 최초 제공일. 정책 버전 선택이나 실제 새 방침 시행일 표시에 쓰지 않는다.
export const JOURNAL_PUBLICATION_POLICY_EFFECTIVE_AT = "2026-10-01T00:00:00+09:00";
export function isJournalPublicationPolicyEffective(now: Date = new Date()) {
  return now.getTime() >= new Date(JOURNAL_PUBLICATION_POLICY_EFFECTIVE_AT).getTime();
}
export function isCurrentJournalPublicationPolicy(version: unknown) {
  return version === JOURNAL_PUBLICATION_POLICY_VERSION;
}
export const journalPublicationPolicy = {
  ...documents["community-guidelines"].document,
  effectiveDate: "시행일 확인 중",
  appendix: [`정책 버전: ${JOURNAL_PUBLICATION_POLICY_VERSION}`],
};
