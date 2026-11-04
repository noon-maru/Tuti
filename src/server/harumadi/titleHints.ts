import type { Prisma } from "@/generated/prisma/client";
import type { Harumadi } from "@/shared/api/harumadi";
import { markDuplicateHarumadiTitles } from "@/shared/harumadi/titleHints";
import { harumadiTogetherEnabled } from "./access";

/** 다른 사람의 비공개 책은 조회하지 않으며 페이지 밖의 동명도 포함한다. */
export async function withHarumadiTitleHints(tx: Pick<Prisma.TransactionClient, "harumadi">, userId: string, books: Harumadi[]) {
  if (!books.length) return books;
  const titles = await tx.harumadi.findMany({ where: harumadiTogetherEnabled()
    ? { OR: [{ ownerId: userId }, { members: { some: { userId, endedAt: null } } }] }
    : { ownerId: userId }, select: { id: true, title: true } });
  return markDuplicateHarumadiTitles(books, titles);
}
