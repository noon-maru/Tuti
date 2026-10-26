// 이전 자료를 읽기 위한 고정 식별자다. 새 API·자료를 이 이름으로 만들지 않는다.
// 적용된 마이그레이션·서명 원장·기존 객체 키를 문자열 치환해서는 안 된다.
export const LEGACY_HARUMADI_PDF_PREFIX = "journal-books/";
export const LEGACY_HARUMADI_DRAFT_PREFIX = "tuti-journal-book-v1:";
export const LEGACY_HARUMADI_DELETION_KIND = "journal_book_deleted";
export const LEGACY_HARUMADI_TARGET_DOMAIN = "book";
export const LEGACY_HARUMADI_APPROVAL_SECRET = "JOURNAL_BOOK_APPROVAL_SECRET";
export const LEGACY_HARUMADI_ACTIVITY_PREFIX = "journal_book_";
export const LEGACY_HARUMADI_PURCHASE_SURFACE = "completed_book";
// 개발 중 잠시 사용한 명칭의 저장 자료도 이름 변경으로 유실하지 않는다.
export const INTERIM_HARUMADI_PDF_PREFIX = "harugalpi-pdfs/";
export const INTERIM_HARUMADI_DRAFT_PREFIX = "tuti-harugalpi-pdf-v1:";
export const INTERIM_HARUMADI_DELETION_KIND = "harugalpi_deleted";
export const INTERIM_HARUMADI_TARGET_DOMAIN = "harugalpi";
export const INTERIM_HARUMADI_APPROVAL_SECRET = "HARUGALPI_PDF_APPROVAL_SECRET";
export const INTERIM_HARUMADI_ACTIVITY_PREFIX = "harugalpi_";
export const INTERIM_HARUMADI_PURCHASE_SURFACE = "completed_harugalpi";
export const HISTORIC_HARUMADI_PDF_PREFIXES = [INTERIM_HARUMADI_PDF_PREFIX, LEGACY_HARUMADI_PDF_PREFIX] as const;
export const HISTORIC_HARUMADI_DRAFT_PREFIXES = [INTERIM_HARUMADI_DRAFT_PREFIX, LEGACY_HARUMADI_DRAFT_PREFIX] as const;
export function canonicalHarumadiAction(value: unknown) {
  const prefix = typeof value === "string" ? [INTERIM_HARUMADI_ACTIVITY_PREFIX, LEGACY_HARUMADI_ACTIVITY_PREFIX].find(prefix => value.startsWith(prefix)) : undefined;
  return prefix && typeof value === "string" ? `harumadi_${value.slice(prefix.length)}` : value;
}
export function canonicalHarumadiSurface(value: unknown) {
  return value === LEGACY_HARUMADI_PURCHASE_SURFACE || value === INTERIM_HARUMADI_PURCHASE_SURFACE ? "completed_harumadi" : value;
}
