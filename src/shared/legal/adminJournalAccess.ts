export const ADMIN_JOURNAL_ACCESS_PURPOSES = {
  support: "이용자가 요청한 문의 처리",
  incident: "장애·데이터 오류 조사",
  rights: "권리 침해·법적 요청 처리",
  security: "보안 사고 조사",
} as const;

export type AdminJournalAccessPurpose = keyof typeof ADMIN_JOURNAL_ACCESS_PURPOSES;

export function parseAdminJournalAccess(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const purpose = input.purpose;
  const reference = typeof input.reference === "string" ? input.reference.trim() : "";
  if (typeof purpose !== "string" || !Object.hasOwn(ADMIN_JOURNAL_ACCESS_PURPOSES, purpose) ||
      !/^[a-zA-Z0-9_-]{3,80}$/.test(reference)) return null;
  return { purpose: purpose as AdminJournalAccessPurpose, reference };
}
