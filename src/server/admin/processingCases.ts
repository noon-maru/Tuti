import { prisma } from "@/server/db/prisma";
import { adminJournalAccessAuditCutoff } from "@/server/admin/journalAccessAudit";
import { parseAdminJournalPurpose } from "@/shared/legal/adminJournalAccess";

type CaseRow = { number: bigint; purpose: string; createdAt: Date };
export function serializeProcessingCase(row: CaseRow) {
  const purpose = parseAdminJournalPurpose(row.purpose);
  if (!purpose) throw new Error("Invalid processing case purpose");
  return { reference: `CASE-${String(row.number).padStart(6, "0")}`, purpose, createdAt: row.createdAt.toISOString() };
}

export async function listProcessingCases(subjectUserId: string) {
  const rows = await prisma.$queryRaw<CaseRow[]>`
    SELECT number, purpose, created_at AS "createdAt" FROM admin_processing_cases
    WHERE subject_user_id = ${subjectUserId} AND created_at >= ${adminJournalAccessAuditCutoff(new Date())}
    ORDER BY number DESC LIMIT 100`;
  return rows.map(serializeProcessingCase);
}

export async function createProcessingCase(subjectUserId: string, actorUserId: string, purpose: string) {
  const rows = await prisma.$queryRaw<CaseRow[]>`
    INSERT INTO admin_processing_cases (subject_user_id, actor_user_id, purpose)
    VALUES (${subjectUserId}, ${actorUserId}, ${purpose})
    RETURNING number, purpose, created_at AS "createdAt"`;
  return serializeProcessingCase(rows[0]);
}

export async function resolveProcessingCase(subjectUserId: string, reference: string) {
  if (!/^CASE-\d{6,19}$/.test(reference)) return null;
  const number = BigInt(reference.slice(5));
  if (number < 1n || number > 9223372036854775807n) return null;
  const rows = await prisma.$queryRaw<CaseRow[]>`
    SELECT number, purpose, created_at AS "createdAt" FROM admin_processing_cases
    WHERE number = ${number} AND subject_user_id = ${subjectUserId}
      AND created_at >= ${adminJournalAccessAuditCutoff(new Date())}`;
  if (!rows[0]) return null;
  const result = serializeProcessingCase(rows[0]);
  return result.reference === reference ? result : null;
}
