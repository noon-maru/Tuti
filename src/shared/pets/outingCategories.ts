/** Shared UI/request values, normalized for stable cache keys. */
export const outingCategories = [
  { value: "shopping", label: "쇼핑" },
  { value: "cafe", label: "카페" },
  { value: "park", label: "공원 · 산책" },
  { value: "nature", label: "바다 · 자연" },
  { value: "culture", label: "문화 · 전시" },
  { value: "activity", label: "체험 · 놀이" },
] as const;
export type OutingCategory = (typeof outingCategories)[number]["value"];
export function isOutingCategory(value: unknown): value is OutingCategory {
  return outingCategories.some(category => category.value === value);
}
export function parseOutingCategories(value: unknown): OutingCategory[] | null {
  if (!Array.isArray(value) || value.length > outingCategories.length || !value.every(isOutingCategory)) return null;
  return outingCategories.filter(category => value.includes(category.value)).map(category => category.value);
}
