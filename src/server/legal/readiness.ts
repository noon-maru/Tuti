export function legalRuntimeFacts(env: Readonly<Record<string, string | undefined>> = process.env) {
  const on = (name: string) => env[name]?.trim().toLowerCase() === "true";
  const present = (name: string) => Boolean(env[name]?.trim());
  const externalMode = env.LOCATION_EXTERNAL_COORDINATE_MODE?.trim();
  return {
    serviceTermsWorkflow: on("SERVICE_TERMS_WORKFLOW_ENABLED"),
    serviceTermsEnforcement: on("SERVICE_TERMS_ENFORCEMENT_ENABLED"),
    rightsWorkflow: on("LEGAL_RIGHTS_WORKFLOW_ENABLED"),
    rightsOperatorAlertConfigured: present("LEGAL_RIGHTS_ALERT_WEBHOOK_URL"),
    privacyReplayLedger: on("PRIVACY_REPLAY_LEDGER_ENABLED"),
    externalCoordinates: externalMode === "processor" || externalMode === "third_party" ? externalMode : "pending",
    userAiProfiling: on("TUTI_USER_AI_PROFILING_ENABLED"),
    objectStorage: on("OBJECT_STORAGE_ENABLED"),
    androidPush: on("FCM_PUSH_ENABLED") || present("FCM_PUSH_TEST_EMAILS"),
    iosPush: on("APNS_PUSH_ENABLED") || present("APNS_PUSH_TEST_EMAILS"),
    authenticationEmailProvider: env.AUTH_EMAIL_PROVIDER === "daum-smartwork" ? "daum-smartwork" : present("AUTH_EMAIL_PROVIDER") ? "other" : "unset",
    // Credentials, addresses, subjects, tokens and test-email allowlists must never be returned.
  };
}
export const LEGAL_MANUAL_CHECKS = ["processingInventory", "processorsAndTransfers", "backupRetentionAndRestoreTest", "rightsRecipientAndForms", "scheduledJobsAndAlerts", "minorProtection", "nativeClientRollout", "legalReview", "finalDocumentApproval", "noticePlan"] as const;
export type LegalReadinessEvidence = { owner: string; contact: string; backupRetentionDays: number | null; approvedDocumentHash: string | null; rightsRecipientNoticeReviewed: boolean; checks: Record<string, { confirmed: boolean; reference: string | null }> };
export function parseLegalReadinessEvidence(value: unknown): LegalReadinessEvidence {
  if (!value || typeof value !== "object") throw new Error("운영 준비 확인 파일이 필요합니다.");
  const input = value as Record<string, unknown>;
  if (typeof input.owner !== "string" || !input.owner.trim() || typeof input.contact !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact)) throw new Error("담당자·연락 창구를 확인해주세요.");
  if (input.backupRetentionDays !== null && (!Number.isInteger(input.backupRetentionDays) || Number(input.backupRetentionDays) < 1 || Number(input.backupRetentionDays) > 365)) throw new Error("확정한 백업 기간 또는 미확정 null이 필요합니다.");
  const checks = input.checks as Record<string, unknown> | undefined;
  const recipient = input.rightsRecipient as Record<string, unknown> | undefined;
  const recipientReviewed = recipient?.publicNoticeRequirementsReviewed === true;
  if (recipientReviewed && (typeof recipient?.publicNoticeReviewReference !== "string" || !/^[A-Za-z0-9_-]{3,100}$/.test(recipient.publicNoticeReviewReference))) throw new Error("수령인 공시 요건 확인 근거 번호가 필요합니다.");
  if (input.approvedDocumentHash !== null && (typeof input.approvedDocumentHash !== "string" || !/^[a-f0-9]{64}$/.test(input.approvedDocumentHash))) throw new Error("최종 승인 문서의 해시 또는 미확정 null이 필요합니다.");
  const confirmed: LegalReadinessEvidence["checks"] = {};
  for (const key of LEGAL_MANUAL_CHECKS) {
    const item = checks?.[key] as { confirmed?: unknown; reference?: unknown } | undefined;
    if (item?.confirmed === true && (typeof item.reference !== "string" || !/^[A-Za-z0-9_-]{3,100}$/.test(item.reference))) throw new Error(`실제 확인 근거 번호가 필요합니다: ${key}`);
    confirmed[key] = { confirmed: item?.confirmed === true, reference: typeof item?.reference === "string" ? item.reference : null };
  }
  return { owner: input.owner.trim(), contact: input.contact, backupRetentionDays: input.backupRetentionDays as number | null, approvedDocumentHash: input.approvedDocumentHash as string | null, rightsRecipientNoticeReviewed: recipientReviewed, checks: confirmed };
}
export function legalReadinessBlockers(evidence: LegalReadinessEvidence, facts: ReturnType<typeof legalRuntimeFacts>) {
  const blockers: string[] = LEGAL_MANUAL_CHECKS.filter((key) => !evidence.checks[key]?.confirmed);
  if (evidence.backupRetentionDays === null) blockers.push("backupRetentionUnconfirmed");
  if (!evidence.approvedDocumentHash) blockers.push("approvedDocumentHashMissing");
  if (!evidence.rightsRecipientNoticeReviewed) blockers.push("rightsRecipientPublicNoticeUnconfirmed");
  if (!facts.serviceTermsWorkflow) blockers.push("serviceTermsWorkflowDisabled");
  if (!facts.rightsWorkflow) blockers.push("rightsWorkflowDisabled");
  if (!facts.rightsOperatorAlertConfigured) blockers.push("rightsOperatorAlertMissing");
  if (!facts.privacyReplayLedger) blockers.push("privacyReplayLedgerDisabled");
  if (facts.userAiProfiling) blockers.push("userAiProfilingConflictsWithDraft");
  if (facts.externalCoordinates === "third_party") blockers.push("unsupportedThirdPartyLocationMode");
  return blockers;
}
