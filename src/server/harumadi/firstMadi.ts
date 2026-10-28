import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { pickHarumadiBackCoverText } from "@/shared/harumadi/backCover";

// 호출자는 같은 트랜잭션에서 소유자 행을 먼저 잠근다.
export async function createDefaultHarumadiForFirstMadi(
  tx: Prisma.TransactionClient,
  ownerId: string,
  entry: { id: string; image: string | null },
) {
  if (await tx.journalEntry.count({ where: { ownerId } }) !== 1) return;
  if (await tx.harumadi.findFirst({ where: { ownerId }, select: { id: true } })) return;
  await tx.harumadi.create({ data: {
    id: randomUUID(), ownerId, title: "우리의 작은 하루",
    coverStyle: "white-plain",
    backCoverText: pickHarumadiBackCoverText(),
    entries: { create: { entryId: entry.id } },
  } });
}
