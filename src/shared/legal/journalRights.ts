export const RIGHTS_STATES = {
  received: "접수·소명 확인", temporary_block: "임시조치 중", copyright_block: "저작권 중단 중",
  counter_received: "재개 요청 검토", resume_scheduled: "재개 예정", court_block: "소 제기 확인",
  closed: "종결", expired: "임시조치 만료",
} as const;
export type RightsState = keyof typeof RIGHTS_STATES;
export type RightsKind = "privacy" | "copyright";
export type RightsAction = "temporary_block" | "copyright_suspend" | "record_counter" | "schedule_resume" | "record_lawsuit" | "close_release" | "resolve_hide";
export type RightsCaseState = {
  kind: string; state: string; receivedAt: Date; blockedAt: Date | null; expiresAt: Date | null;
  counterRequestedAt: Date | null; resumeAt: Date | null; litigationNotifiedAt: Date | null;
};
export class RightsWorkflowError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const DAY = 86400000;
export function validRightsReference(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{3,100}$/.test(value);
}
export function dateFromRightsInput(value: unknown, label: string) {
  const date = new Date(typeof value === "string" ? value : "");
  if (!Number.isFinite(date.getTime())) throw new RightsWorkflowError(`${label}을 확인해주세요.`);
  return date;
}
export function rightsBlockActive(record: RightsCaseState, resumeNoticeComplete: boolean, now = new Date()) {
  if (record.state === "temporary_block") return Boolean(record.expiresAt && now < record.expiresAt);
  if (["copyright_block", "counter_received", "court_block"].includes(record.state)) return true;
  if (record.state === "resume_scheduled") return !record.resumeAt || now < record.resumeAt || !resumeNoticeComplete || Boolean(record.litigationNotifiedAt);
  return false;
}
export function planRightsTransition(record: RightsCaseState, action: RightsAction, input: Record<string, unknown>, now = new Date()) {
  if (!validRightsReference(input.proofReference)) throw new RightsWorkflowError("소명·판단 근거 번호를 입력해주세요.");
  const review = new Date(now.getTime() + 30 * DAY);
  if (action === "temporary_block" && record.kind === "privacy" && record.state === "received") {
    const days = input.days === undefined ? 30 : Number(input.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) throw new RightsWorkflowError("임시조치는 1~30일 이내로 지정해주세요.");
    const expiresAt = new Date(now.getTime() + days * DAY);
    return { state: "temporary_block", blockedAt: now, expiresAt, nextReviewAt: expiresAt };
  }
  if (action === "copyright_suspend" && record.kind === "copyright" && record.state === "received") {
    return { state: "copyright_block", blockedAt: now, nextReviewAt: new Date(now.getTime() + 3 * DAY) };
  }
  if (action === "record_counter" && record.kind === "copyright" && record.state === "copyright_block") {
    const receivedAt = dateFromRightsInput(input.receivedAt, "실제 재개 요청 접수일");
    if (receivedAt > now || (record.blockedAt && receivedAt < record.blockedAt)) throw new RightsWorkflowError("재개 요청의 실제 접수 시각을 확인해주세요.");
    const due = new Date(receivedAt.getTime() + 3 * DAY);
    return { state: "counter_received", counterRequestedAt: receivedAt, decisionDueAt: due, nextReviewAt: due };
  }
  if (action === "schedule_resume" && record.kind === "copyright" && record.state === "counter_received" && record.counterRequestedAt) {
    if (input.rightsVerified !== true) throw new RightsWorkflowError("정당한 이용 권리의 소명 확인이 필요해요.");
    const resumeAt = dateFromRightsInput(input.resumeAt, "재개 예정일");
    const days = (resumeAt.getTime() - record.counterRequestedAt.getTime()) / DAY;
    if (days < 7 || days > 14 || resumeAt <= now) throw new RightsWorkflowError("재개 요청일로부터 7~14일 사이의 미래 시각이어야 해요. 기한이 지났다면 별도 법률 검토가 필요해요.");
    return { state: "resume_scheduled", resumeAt, nextReviewAt: resumeAt };
  }
  if (action === "record_lawsuit" && record.kind === "copyright" && record.state === "resume_scheduled" && record.resumeAt) {
    const receivedAt = dateFromRightsInput(input.receivedAt, "소 제기 사실 통보 접수일");
    if (receivedAt > now || receivedAt >= record.resumeAt) throw new RightsWorkflowError("재개 예정일 전에 접수된 소 제기 통보인지 확인해주세요.");
    return { state: "court_block", litigationNotifiedAt: receivedAt, nextReviewAt: review };
  }
  if ((action === "close_release" || action === "resolve_hide") && !["closed", "expired"].includes(record.state)) {
    return { state: "closed", closedAt: now, nextReviewAt: now };
  }
  throw new RightsWorkflowError("현재 상태에서는 이 조치를 할 수 없어요. 이미 처리했거나 기한 연장은 허용되지 않아요.", 409);
}

export type RightsNoticeItem = { id: string; kind: string; recipientRole: string; recipientEmail: string | null; status: string; requiresFormalNotice: boolean; sentAt: string | null; errorCode: string | null };
export type RightsCaseItem = { id: string; reportId: string; reference: string; kind: RightsKind; state: RightsState; revision: number; entryId: string | null; receivedAt: string; expiresAt: string | null; resumeAt: string | null; nextReviewAt: string; overdue: boolean; notices: RightsNoticeItem[] };
export type RightsCasesResponse = { enabled: boolean; emailEnabled: boolean; cases: RightsCaseItem[] };
