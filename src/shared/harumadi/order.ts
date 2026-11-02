/** 배열을 변형하지 않고 명시한 ID 순서로 정렬한다. 부가 항목은 원래 순서로 뒤에 둔다. */
export function orderByEntryIds<T extends { id: string }>(entries: readonly T[], ids: readonly string[]): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...entries].sort((a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length));
}

export function moveEntry(ids: readonly string[], id: string, target: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0 || target < 0 || target >= ids.length || from === target) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(target, 0, id);
  return next;
}
