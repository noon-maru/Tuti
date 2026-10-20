import type { JournalEntryInput } from "@/shared/api/journal";
import type { JournalBookInput } from "@/shared/api/journalBook";
import { privacyReplayEnabled } from "@/server/legal/privacyReplayLedger";
import { SENSITIVE_JOURNAL_CONSENT_VERSION } from "@/shared/legal/sensitiveJournalPolicy";

export const sensitiveJournalPolicyEnabled = () => process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED === "true";

export function publicSensitiveJournalFilter() {
  return { sensitiveWithdrawnAt: null,
    ...(sensitiveJournalPolicyEnabled() ? { sensitiveContent: false } : {
      OR: [{ sensitiveContent: false }, { sensitiveContent: null }],
    }) };
}

export class SensitiveJournalPolicyError extends Error {
  readonly status = 409;
}

export function sensitiveJournalData(input: JournalEntryInput, enabled = sensitiveJournalPolicyEnabled(), now = new Date()) {
  if (!enabled) {
    if (input.sensitiveContent === true) throw new SensitiveJournalPolicyError("민감정보를 포함한 기록 저장은 아직 준비 중이에요. 해당 내용을 빼고 저장해주세요.");
    return {};
  }
  if (typeof input.sensitiveContent !== "boolean") throw new SensitiveJournalPolicyError("기록에 민감정보가 있는지 확인해주세요. 앱이 오래된 경우 업데이트가 필요해요.");
  if (input.sensitiveContent && input.sensitiveConsentVersion !== SENSITIVE_JOURNAL_CONSENT_VERSION) {
    throw new SensitiveJournalPolicyError("민감정보 처리에 별도로 동의하거나 해당 내용을 빼고 저장해주세요.");
  }
  if (input.sensitiveContent && !privacyReplayEnabled()) throw new SensitiveJournalPolicyError("기록 보호 절차를 준비 중이에요. 민감정보를 빼고 저장해주세요.");
  return {
    sensitiveContent: input.sensitiveContent,
    sensitiveConsentVersion: input.sensitiveContent ? SENSITIVE_JOURNAL_CONSENT_VERSION : null,
    sensitiveConsentedAt: input.sensitiveContent ? now : null,
  };
}

export function assertJournalBookFreeform(input: JournalBookInput) {
  if (sensitiveJournalPolicyEnabled() && input.freeformNonSensitiveConfirmed !== true) {
    throw new SensitiveJournalPolicyError("표지 제목과 남기는 말에 민감정보가 없는지 확인해주세요. 민감정보는 별도 동의한 기록에서만 가져올 수 있어요.");
  }
}

export function assertSensitiveJournalReadable(entry: {
  sensitiveContent: boolean | null;
  sensitiveConsentVersion: string | null;
  sensitiveWithdrawnAt: Date | null;
}, enabled = sensitiveJournalPolicyEnabled()) {
  if (entry.sensitiveWithdrawnAt || (entry.sensitiveContent === true && !privacyReplayEnabled()) || (enabled && entry.sensitiveContent !== false &&
      !(entry.sensitiveContent === true && entry.sensitiveConsentVersion === SENSITIVE_JOURNAL_CONSENT_VERSION))) {
    throw new SensitiveJournalPolicyError("민감정보 처리 확인이 필요한 기록이에요. 기록을 수정해 확인하거나 삭제해주세요.");
  }
}
