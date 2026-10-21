export const RETENTION_HOLDS_KEY = "privacy.retention-holds.v1";
export const GENERAL_ERROR_CATEGORY = "diagnostic";
export const GENERAL_ERROR_ACTION = "diagnostic.error";
export const RETENTION_RESOURCES = ["inquiry", "shareTrace", "errorLog"] as const;
export type RetentionResource = typeof RETENTION_RESOURCES[number];
export type EvidenceHold = {
  id: string; resource: RetentionResource; targetId: string; caseReference: string;
  purpose: string; legalBasis: string; owner: string; terminationCondition: string;
  reviewedAt: string;
};

function validDate(date: Date) {
  if (!Number.isFinite(date.getTime())) throw new Error("RETENTION_DATE_INVALID");
  return date;
}

// 윤일에는 전년 3월 1일로 넘기지 않아 보존기간을 단축하지 않는다.
function yearsBefore(now: Date, years: number) {
  const result = new Date(validDate(now));
  result.setUTCFullYear(now.getUTCFullYear() - years);
  if (result.getUTCMonth() !== now.getUTCMonth()) result.setUTCDate(0);
  return result;
}

export function retentionCutoffs(now: Date) {
  validDate(now);
  return {
    inquiries: yearsBefore(now, 3),
    unfinishedShares: new Date(now.getTime() - 30 * 86_400_000),
    generalErrors: yearsBefore(now, 1),
  };
}

export function evidenceReviewDue(hold: EvidenceHold, now: Date) {
  return validDate(now).getTime() >= new Date(hold.reviewedAt).getTime() + 90 * 86_400_000;
}

// 손상·알 수 없는 버전/필드는 보전 예외를 무시하지 않고 전체 신규 정리를 중지한다.
export function parseEvidenceHolds(value: string | null, now: Date): EvidenceHold[] {
  validDate(now);
  if (value === null) return [];
  const parsed = JSON.parse(value) as { version?: unknown; holds?: unknown };
  if (!parsed || Object.keys(parsed).sort().join(",") !== "holds,version" || parsed.version !== 1 || !Array.isArray(parsed.holds) || parsed.holds.length > 1000) throw new Error("RETENTION_HOLDS_INVALID");
  const fields = ["id", "resource", "targetId", "caseReference", "purpose", "legalBasis", "owner", "terminationCondition", "reviewedAt"].sort().join(",");
  const ids = new Set<string>();
  for (const hold of parsed.holds) {
    if (!hold || typeof hold !== "object" || Object.keys(hold).sort().join(",") !== fields) throw new Error("RETENTION_HOLD_INVALID");
    for (const field of Object.keys(hold)) {
      if (typeof hold[field] !== "string" || !hold[field].trim() || hold[field].length > 400 || /[\u0000-\u001f]/.test(hold[field])) throw new Error("RETENTION_HOLD_INVALID");
    }
    if (!RETENTION_RESOURCES.includes(hold.resource) || !/^[\w-]{1,100}$/.test(hold.id) || hold.targetId.length > 200 || ids.has(hold.id)) throw new Error("RETENTION_HOLD_INVALID");
    const reviewedAt = new Date(hold.reviewedAt);
    if (!Number.isFinite(reviewedAt.getTime()) || reviewedAt.toISOString() !== hold.reviewedAt || reviewedAt > now) throw new Error("RETENTION_REVIEW_INVALID");
    ids.add(hold.id);
  }
  return parsed.holds as EvidenceHold[];
}

export function retentionPredicates(now: Date, holds: EvidenceHold[]) {
  const cutoffs = retentionCutoffs(now);
  const excluded = (resource: RetentionResource) => holds.filter(hold => hold.resource === resource).map(hold => hold.targetId);
  return {
    inquiries: {
      status: { in: ["answered", "closed"] as ("answered" | "closed")[] },
      handledAt: { lte: cutoffs.inquiries },
      // 과거 자료의 완료일보다 나중에 수정됐다면 보수적으로 그 수정일부터도 3년이 지나야 한다.
      updatedAt: { lte: cutoffs.inquiries },
      id: { notIn: excluded("inquiry") },
    },
    unfinishedShares: {
      finalizedAt: null, issuedAt: { lte: cutoffs.unfinishedShares },
      traceId: { notIn: excluded("shareTrace") },
    },
    generalErrors: {
      category: GENERAL_ERROR_CATEGORY, action: GENERAL_ERROR_ACTION, level: "error" as const,
      createdAt: { lte: cutoffs.generalErrors }, id: { notIn: excluded("errorLog") },
    },
  };
}
