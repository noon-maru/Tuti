export const SENSITIVE_JOURNAL_CONSENT_VERSION = "sensitive-journal-v1";
export const sensitiveJournalConsentNotice = {
  items: "본인이 직접 선택해 남기는 건강, 사상·신념, 정치적 견해, 노동조합·정당 가입·탈퇴, 성생활 등 민감정보가 포함된 사진·글",
  purpose: "본인의 비공개 기록 저장·조회와 개인용 디지털 기록집 생성·보관",
  retention: "해당 기록 삭제, 동의 철회 또는 계정 삭제 시까지. 복구용 백업은 접근을 제한하고 30일 기준으로 정기 정리하며, 복구 시 삭제·철회를 재반영합니다.",
  refusal: "동의하지 않아도 일반 기록은 이용할 수 있어요. 민감정보를 빼고 저장해주세요. 타인의 민감정보와 주민등록번호 등 고유식별정보는 남길 수 없어요.",
  withdrawal: "기록 메뉴의 ‘민감정보 동의 철회’로 철회할 수 있어요. 해당 기록·사진과 이를 포함한 서버 기록집을 삭제합니다. 이미 내려받거나 외부에 전달한 사본은 직접 정리해주세요.",
} as const;

export type SensitiveJournalPolicyResponse = { enabled: boolean; version: string; privateStorageAvailable?: boolean };

/** Older servers expose only enabled; their consent-aware write path remains authoritative. */
export function canStoreSensitiveJournal(policy: SensitiveJournalPolicyResponse) {
  return policy.enabled && policy.privateStorageAvailable !== false;
}

export function canSubmitJournalClassification(
  policy: SensitiveJournalPolicyResponse | null,
  sensitiveContent: boolean | null,
  agreed: boolean,
) {
  return !!policy && policy.version === SENSITIVE_JOURNAL_CONSENT_VERSION &&
    sensitiveContent !== null && (!sensitiveContent || (canStoreSensitiveJournal(policy) && agreed));
}
