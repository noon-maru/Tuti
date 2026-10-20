import { pushTransferBlockers, readPushProviderEvidence, type PushProvider } from "./pushTransferReadiness";

export const LEGAL_READINESS_SCOPES = ["all", "service-terms", "push"] as const;
export type LegalReadinessScope = (typeof LEGAL_READINESS_SCOPES)[number];

export function parseLegalReadinessScope(value: unknown): LegalReadinessScope {
  if (value === undefined) return "all";
  if (!LEGAL_READINESS_SCOPES.includes(value as LegalReadinessScope)) throw new Error("점검 범위는 all, service-terms, push 중 하나여야 합니다.");
  return value as LegalReadinessScope;
}

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
// 일반약관 문서와 그에 필요한 운영·동의 전환의 확인 항목이다.
// 푸시 국가·기간·이전 근거·기기 검증은 pushTransferReview에서 별도로 심사한다.
export const LEGAL_MANUAL_CHECKS = ["processingInventory", "processorsAndTransfers", "backupRetentionAndRestoreTest", "rightsRecipientAndForms", "scheduledJobsAndAlerts", "minorProtection", "nativeClientRollout", "legalReview", "finalDocumentApproval", "noticePlan"] as const;
export type LegalReadinessEvidence = { owner: string; contact: string; backupRetentionDays: number | null; approvedDocumentHash: string | null; rightsRecipientNoticeReviewed: boolean; pushTransfers: Partial<Record<PushProvider, unknown>>; checks: Record<string, { confirmed: boolean; reference: string | null }> };
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
  return { owner: input.owner.trim(), contact: input.contact, backupRetentionDays: input.backupRetentionDays as number | null, approvedDocumentHash: input.approvedDocumentHash as string | null, rightsRecipientNoticeReviewed: recipientReviewed, pushTransfers: readPushProviderEvidence(input.pushTransferReview), checks: confirmed };
}
export function serviceTermsReadinessBlockers(evidence: LegalReadinessEvidence, facts: ReturnType<typeof legalRuntimeFacts>) {
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

export function pushReadinessBlockers(evidence: Pick<LegalReadinessEvidence, "pushTransfers">) {
  // 서버 발송 플래그가 꺼져 있어도 기존 SDK의 처리가 없다고 증명되지 않는다.
  return [
    ...pushTransferBlockers("fcm", evidence.pushTransfers.fcm),
    ...pushTransferBlockers("apns", evidence.pushTransfers.apns),
  ];
}

export function legalReadinessBlockers(evidence: LegalReadinessEvidence, facts: ReturnType<typeof legalRuntimeFacts>, scope: LegalReadinessScope = "all") {
  const selected = parseLegalReadinessScope(scope);
  if (selected === "push") return pushReadinessBlockers(evidence);
  const terms = serviceTermsReadinessBlockers(evidence, facts);
  return selected === "service-terms" ? terms : [...terms, ...pushReadinessBlockers(evidence)];
}

export function legalReadinessReport(evidence: LegalReadinessEvidence, facts: ReturnType<typeof legalRuntimeFacts>, scope: LegalReadinessScope = "all") {
  const selected = parseLegalReadinessScope(scope);
  const terms = serviceTermsReadinessBlockers(evidence, facts);
  const push = pushReadinessBlockers(evidence);
  const all = [...terms, ...push];
  const blockers = selected === "all" ? all : selected === "push" ? push : terms;
  return {
    readinessScope: selected,
    ready: blockers.length === 0,
    allReady: all.length === 0,
    blockers,
    scopes: {
      "service-terms": { ready: terms.length === 0, blockers: terms },
      push: { ready: push.length === 0, blockers: push },
    },
    unresolvedOutsideScope: selected === "all" ? [] : selected === "push" ? terms : push,
    // 문서 승인과 개별 처리의 적법성·실제 운영 확인을 구분한다.
    operationalCompletionVerified: false,
  };
}

export function parseLegalReadinessArguments(args: string[]) {
  let file = "docs/legal/readiness-status.json";
  let scope: LegalReadinessScope = "all";
  let strict = false;
  const seen = new Set<string>();
  for (const arg of args) {
    const key = arg.split("=", 1)[0];
    if (seen.has(key)) throw new Error("점검 옵션을 중복해서 지정할 수 없습니다.");
    seen.add(key);
    if (arg === "--strict") strict = true;
    else if (arg.startsWith("--scope=")) scope = parseLegalReadinessScope(arg.slice(8));
    else if (arg.startsWith("--file=") && arg.slice(7)) file = arg.slice(7);
    else throw new Error("--file=확인파일.json [--scope=all|service-terms|push] [--strict] 형식으로 실행해주세요.");
  }
  return { file, scope, strict };
}
