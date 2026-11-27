import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { pickHarumadiBackCoverText } from "@/shared/harumadi/backCover";
import { recordContribution, recordLifecycle } from "@/server/analytics/lifecycle";
import type { LifecycleContext } from "@/shared/api/lifecycle";
import type { Harumadi } from "@/shared/api/harumadi";
import { harumadiTogetherEnabled } from "./access";

// 호출자는 같은 트랜잭션에서 소유자 행을 먼저 잠근다.
export async function createDefaultHarumadiForFirstMadi(
  tx: Prisma.TransactionClient,
  ownerId: string,
  entry: { id: string; image: string | null },
  context: LifecycleContext = {},
): Promise<Harumadi | undefined> {
  if (await tx.journalEntry.count({ where: { ownerId } }) !== 1) return;
  if (await tx.harumadi.findFirst({ where: { ownerId }, select: { id: true } })) return;
  const bookId = randomUUID(), linkId = randomUUID();
  const book = await tx.harumadi.create({ data: {
    id: bookId, ownerId, title: "우리의 작은 하루",
    coverStyle: "white-plain",
    backCoverText: pickHarumadiBackCoverText(),
    entries: { create: { id: linkId, entryId: entry.id } },
  }, select: { id: true, title: true, coverStyle: true, paperColor: true, backCoverText: true, revision: true, createdAt: true, updatedAt: true } });
  await recordLifecycle(tx, ownerId, { name: "harumadi_created", key: `book:${bookId}`, entityId: bookId, bookId, origin: "first_madi_auto" }, context);
  await recordContribution(tx, ownerId, bookId, entry.id, linkId, context);
  return { ...book, coverStyle: book.coverStyle as Harumadi["coverStyle"], paperColor: book.paperColor as Harumadi["paperColor"],
    createdAt: book.createdAt.toISOString(), updatedAt: book.updatedAt.toISOString(), entryIds: [entry.id],
    shared: false, role: "owner", togetherEnabled: harumadiTogetherEnabled() };
}
