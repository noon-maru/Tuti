type Link = { position?: number | null; entryId: string; entry: { id?: string; visitedAt: Date } };

/** DB가 연결 시 부여한 위치(또는 사용자가 지정한 위치)를 따른다.
 * 아직 이전되지 않은 null 연결에 한해서만 종전 표시 순서를 사용한다. */
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
