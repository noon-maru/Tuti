type Link = { position?: number | null; entryId: string; entry: { id?: string; visitedAt: Date } };

/** null은 지정된 순서 뒤에 놓고, 미지정 마디끼리는 종전의 날짜·ID 순서를 유지한다. */
export function orderedLinks<T extends Link>(links: readonly T[]): T[] {
  return [...links].sort((a, b) => {
    const rank = (a.position ?? Infinity) - (b.position ?? Infinity);
    if (rank && Number.isFinite(rank)) return rank;
    if (a.position != null && b.position == null) return -1;
    if (a.position == null && b.position != null) return 1;
    return (new Date(a.entry.visitedAt).getTime() - new Date(b.entry.visitedAt).getTime()) ||
      (a.entryId ?? a.entry.id ?? "").localeCompare(b.entryId ?? b.entry.id ?? "");
  });
}
