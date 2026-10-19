import { prisma } from "@/server/db/prisma";
import { writeSystemLog } from "@/server/admin/log";
import type { AdminJournalAccessPurpose } from "@/shared/legal/adminJournalAccess";

export const ADMIN_JOURNAL_ACCESS_AUDIT_YEARS = 2;
export const LEGACY_ADMIN_JOURNAL_ACCESS_AUDIT = { category: "journal", action: "journal.admin.viewed" } as const;

export function adminJournalAccessAuditCutoff(now: Date) {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(now.getUTCFullYear() - ADMIN_JOURNAL_ACCESS_AUDIT_YEARS);
  // 윤일의 자동 3월 이월로 경계 자료를 일찍 지우지 않는다.
  if (cutoff.getUTCMonth() !== now.getUTCMonth()) cutoff.setUTCDate(0);
  return cutoff;
}

export async function writeAdminJournalAccessAudit(input: {
  actorUserId: string; subjectUserId: string; purpose: AdminJournalAccessPurpose;
  reference: string; entryIds: string[]; page: number; resultCount: number; total: number;
}) {
  await prisma.$transaction(async (transaction) => {
    // DB 트리거가 동일 id로 보존본을 만든다. 구버전 서버의 쓰기도 같은 보호를 받는다.
    const log = await writeSystemLog({
      ...LEGACY_ADMIN_JOURNAL_ACCESS_AUDIT, message: "관리자가 사용자의 기록을 조회했습니다.",
      actorUserId: input.actorUserId, targetType: "user", targetId: input.subjectUserId,
      metadata: { purpose: input.purpose, reference: input.reference, page: input.page, resultCount: input.resultCount, total: input.total, entryIds: input.entryIds.join(",") },
    }, transaction);
    // 트리거·보존본이 없으면 일반 로그만 남긴 채 내용을 반환하지 않는다.
    await transaction.adminJournalAccessAudit.findUniqueOrThrow({ where: { id: log.id } });
  });
}
