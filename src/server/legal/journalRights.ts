import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { writeSystemLog } from "@/server/admin/log";
import { dateFromRightsInput, planRightsTransition, rightsBlockActive, RightsWorkflowError, validRightsReference, type RightsAction } from "@/shared/legal/journalRights";

type Transaction = Prisma.TransactionClient;
export const journalRightsEnabled = () => process.env.LEGAL_RIGHTS_WORKFLOW_ENABLED === "true";
const closedStates = ["closed", "expired"];
const complete = (status: string) => status === "manual_confirmed";

export async function isJournalLegallyBlocked(entryId: string, now = new Date()) {
  if (!journalRightsEnabled()) return false;
  const cases = await prisma.journalRightsCase.findMany({
    where: { report: { entryId }, state: { notIn: closedStates } },
    include: { notices: { where: { kind: "schedule_resume", recipientRole: "applicant" } } },
  });
  return cases.some((record) => rightsBlockActive(record, record.notices.some((notice) => complete(notice.status)), now));
}

function assertEnabled() {
  if (!journalRightsEnabled()) throw new RightsWorkflowError("권리 침해 처리 절차는 아직 활성화되지 않았어요.", 409);
}
function reference(value: unknown) {
  if (!validRightsReference(value)) throw new RightsWorkflowError("개인정보 대신 영문·숫자로 된 사건·근거 번호를 입력해주세요.");
  return value;
}
async function audit(tx: Transaction, id: string, action: string, actorUserId?: string) {
  await writeSystemLog({ category: "moderation", action: `rights_${action}`, message: "공개 기록 권리 침해 절차 처리", actorUserId, targetType: "rightsCase", targetId: id }, tx);
}

// 연락처와 증빙 원문을 복제하지 않는다. 법정 서식 및 실제 전달 근거는 별도 확인 후 등록한다.
async function queueNotices(tx: Transaction, record: { id: string; revision: number; kind: string; report: { reporterUserId: string; targetOwnerId: string } }, action: string) {
  await tx.journalRightsNotice.createMany({ data: (["applicant", "author"] as const).map((role) => ({
    id: randomUUID(), caseId: record.id, eventSequence: record.revision, recipientRole: role,
    recipientUserId: role === "applicant" ? record.report.reporterUserId : record.report.targetOwnerId,
    kind: action, message: "사건별 조치 내용·사유·권리 행사 방법을 확인하여 통지해주세요.",
    requiresFormalNotice: record.kind === "copyright", status: "manual_required",
  })) });
}

export async function createRightsCase(input: Record<string, unknown>, actorUserId: string, now = new Date()) {
  assertEnabled();
  const reportId = typeof input.reportId === "string" ? input.reportId.slice(0, 100) : "";
  const caseReference = reference(input.reference);
  const proofReference = reference(input.proofReference);
  if (input.evidenceVerified !== true) throw new RightsWorkflowError("권리 침해 소명 자료 확인이 필요해요.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM content_reports WHERE id = ${reportId} FOR UPDATE`;
    const report = await tx.contentReport.findUnique({ where: { id: reportId }, include: { rightsCase: true } });
    if (!report || !["privacy", "copyright"].includes(report.reason)) throw new RightsWorkflowError("개인정보·저작권 신고 번호를 확인해주세요.");
    if (report.rightsCase) throw new RightsWorkflowError("이미 사건으로 등록된 신고예요.", 409);
    const receivedAt = input.receivedAt ? dateFromRightsInput(input.receivedAt, "실제 접수일") : report.createdAt;
    if (receivedAt > now) throw new RightsWorkflowError("미래 시각을 접수일로 등록할 수 없어요.");
    const record = await tx.journalRightsCase.create({ data: { id: randomUUID(), reportId, reference: caseReference, proofReference, kind: report.reason, receivedAt, nextReviewAt: receivedAt } });
    await audit(tx, record.id, "received", actorUserId);
    return record;
  });
}

export async function actOnRightsCase(input: Record<string, unknown>, actorUserId: string, now = new Date()) {
  assertEnabled();
  const id = typeof input.id === "string" ? input.id.slice(0, 100) : "";
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM journal_rights_cases WHERE id = ${id} FOR UPDATE`;
    const record = await tx.journalRightsCase.findUnique({ where: { id }, include: { report: true, notices: true } });
    if (!record) throw new RightsWorkflowError("사건을 찾을 수 없어요.", 404);
    if (input.revision !== record.revision) throw new RightsWorkflowError("다른 담당자가 처리했어요. 새로고침해주세요.", 409);
    if (input.action === "confirm_notice") {
      const notice = record.notices.find((item) => item.id === input.noticeId);
      if (!notice || notice.status !== "manual_required") throw new RightsWorkflowError("확인할 통지 작업이 없어요.", 409);
      const sentAt = dateFromRightsInput(input.sentAt, "실제 통지일");
      if (sentAt > now || sentAt < notice.createdAt) throw new RightsWorkflowError("통지 작업 생성 이후의 실제 전달 시각을 확인해주세요.");
      if (input.formAndDeliveryVerified !== true) throw new RightsWorkflowError("필요한 서식·첨부 자료와 실제 전달 근거 확인이 필요해요.");
      await tx.journalRightsNotice.update({ where: { id: notice.id }, data: { status: "manual_confirmed", sentAt, deliveryProofReference: reference(input.proofReference) } });
      await tx.journalRightsCase.update({ where: { id }, data: { revision: { increment: 1 } } });
      await audit(tx, id, "notice_confirmed", actorUserId);
      return;
    }
    if (input.action === "record_counter") {
      const originalNotice = record.notices.find((notice) => notice.kind === "copyright_suspend" && notice.recipientRole === "author" && complete(notice.status));
      const receivedAt = dateFromRightsInput(input.receivedAt, "실제 재개 요청 접수일");
      if (originalNotice?.sentAt && receivedAt.getTime() > originalNotice.sentAt.getTime() + 30 * 86400000) throw new RightsWorkflowError("통지 수령 후 30일을 넘긴 요청은 별도 법률 검토가 필요해요.");
    }
    const change = planRightsTransition(record, input.action as RightsAction, input, now);
    if (input.action === "resolve_hide" && record.report.entryId) {
      await tx.journalEntry.updateMany({ where: { id: record.report.entryId }, data: { publicationStatus: "hidden", publicationStatusChangedAt: now } });
    }
    const updated = await tx.journalRightsCase.update({ where: { id }, data: { ...change, proofReference: reference(input.proofReference), revision: { increment: 1 } }, include: { report: true } });
    if (change.state === "closed") await tx.contentReport.update({ where: { id: record.reportId }, data: { status: "resolved", reviewedAt: now, reviewerUserId: actorUserId } });
    await queueNotices(tx, updated, String(input.action));
    await audit(tx, id, String(input.action), actorUserId);
  });
}

export async function listRightsCases() {
  if (!journalRightsEnabled()) return { enabled: false, emailEnabled: false, cases: [] };
  const cases = await prisma.journalRightsCase.findMany({ where: { OR: [{ state: { notIn: closedStates } }, { notices: { some: { status: "manual_required" } } }] }, orderBy: [{ nextReviewAt: "asc" }, { id: "asc" }], take: 200, include: { report: { select: { entryId: true } }, notices: { orderBy: { createdAt: "asc" } } } });
  return { enabled: true, emailEnabled: false, cases: cases.map((record) => {
    const noticeDue = record.notices.filter((notice) => notice.status === "manual_required").map((notice) => new Date(notice.createdAt.getTime() + (record.kind === "copyright" ? 3 * 86400000 : 0)));
    const nextReviewAt = new Date(Math.min(...[...noticeDue, ...(!closedStates.includes(record.state) ? [record.nextReviewAt] : [])].map((date) => date.getTime())));
    return {
    id: record.id, reportId: record.reportId, reference: record.reference, kind: record.kind, state: record.state, revision: record.revision, entryId: record.report.entryId,
    receivedAt: record.receivedAt.toISOString(), expiresAt: record.expiresAt?.toISOString() ?? null, resumeAt: record.resumeAt?.toISOString() ?? null,
    nextReviewAt: nextReviewAt.toISOString(), overdue: nextReviewAt <= new Date(),
    notices: record.notices.map((notice) => ({ id: notice.id, kind: notice.kind, recipientRole: notice.recipientRole, recipientEmail: null, status: notice.status, requiresFormalNotice: notice.requiresFormalNotice, sentAt: notice.sentAt?.toISOString() ?? null, errorCode: notice.errorCode })),
  }; }) };
}

export async function maintainRightsCases(apply = false, now = new Date()) {
  assertEnabled();
  // Cursor is unnecessary: each run checks all due cases, while each transaction rechecks under a row lock.
  const candidates = await prisma.journalRightsCase.findMany({ where: { state: { notIn: closedStates }, nextReviewAt: { lte: now } }, select: { id: true }, orderBy: { id: "asc" } });
  const result = { inspected: 0, expired: 0, resumed: 0, needsReview: 0, dryRun: !apply };
  for (const candidate of candidates) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM journal_rights_cases WHERE id = ${candidate.id} FOR UPDATE`;
      const record = await tx.journalRightsCase.findUnique({ where: { id: candidate.id }, include: { report: true, notices: true } });
      if (!record || closedStates.includes(record.state)) return;
      result.inspected++;
      const temporaryExpired = record.state === "temporary_block" && record.expiresAt && record.expiresAt <= now;
      const resumeReady = record.state === "resume_scheduled" && !rightsBlockActive(record, record.notices.some((notice) => notice.kind === "schedule_resume" && notice.recipientRole === "applicant" && complete(notice.status)), now);
      if (!temporaryExpired && !resumeReady) { result.needsReview++; return; }
      if (temporaryExpired) result.expired++; else result.resumed++;
      if (!apply) return;
      const updated = await tx.journalRightsCase.update({ where: { id: record.id }, data: { state: temporaryExpired ? "expired" : "closed", closedAt: now, revision: { increment: 1 } }, include: { report: true } });
      await tx.contentReport.update({ where: { id: record.reportId }, data: { status: "resolved", reviewedAt: now } });
      await queueNotices(tx, updated, temporaryExpired ? "expired" : "resumed");
      await audit(tx, record.id, temporaryExpired ? "expired" : "resumed");
      // Never republish or modify the owner's independent publication choice here.
    });
  }
  return result;
}

export async function sendRightsDeadlineAlert(now = new Date(), fetcher: typeof fetch = fetch) {
  assertEnabled();
  const address = process.env.LEGAL_RIGHTS_ALERT_WEBHOOK_URL?.trim();
  if (!address) return { enabled: false, alerted: 0 };
  const url = new URL(address);
  if (url.protocol !== "https:" || url.username || url.password) throw new RightsWorkflowError("운영 알림에는 HTTPS 웹훅 주소를 사용해주세요.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('tuti-journal-rights-deadline-alert'))`;
    const due = await tx.journalRightsCase.findMany({ where: {
      AND: [
        { OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lte: new Date(now.getTime() - 86400000) } }] },
        { OR: [
          { state: { notIn: closedStates }, nextReviewAt: { lte: now } },
          { notices: { some: { status: "manual_required", requiresFormalNotice: false, createdAt: { lte: now } } } },
          { notices: { some: { status: "manual_required", requiresFormalNotice: true, createdAt: { lte: new Date(now.getTime() - 3 * 86400000) } } } },
        ] },
      ],
    }, select: { id: true }, orderBy: { id: "asc" }, take: 100 });
    if (!due.length) return { enabled: true, alerted: 0 };
    // No case IDs, journal text, claimant contacts or proof references leave this service.
    const response = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `Tuti 공개 기록 권리 보호: 기한·통지 확인이 필요한 사건 ${due.length}건이 있어요. 운영센터의 공개 기록 권리 보호 화면을 확인해주세요.` }), signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!response.ok) throw new Error("Rights deadline alert delivery failed");
    await tx.journalRightsCase.updateMany({ where: { id: { in: due.map((item) => item.id) } }, data: { lastRemindedAt: now } });
    return { enabled: true, alerted: due.length };
  }, { timeout: 15000 });
}
