const MAX_ACCOUNT_DISPLAY_NAME_LENGTH = 100;
const HANGUL_NAME_PATTERN = /^[\p{Script=Hangul}]+$/u;

export function normalizeAccountDisplayName(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;

  return Array.from(normalized)
    .slice(0, MAX_ACCOUNT_DISPLAY_NAME_LENGTH)
    .join("");
}

export function formatKoreanOrderedName(
  givenNameValue: unknown,
  familyNameValue: unknown,
  fallbackValue?: unknown,
) {
  const givenName = normalizeAccountDisplayName(givenNameValue);
  const familyName = normalizeAccountDisplayName(familyNameValue);

  if (givenName && familyName) {
    return HANGUL_NAME_PATTERN.test(givenName) &&
      HANGUL_NAME_PATTERN.test(familyName)
      ? `${familyName}${givenName}`
      : `${familyName} ${givenName}`;
  }

  return familyName ?? givenName ?? normalizeAccountDisplayName(fallbackValue);
}
