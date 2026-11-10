import type { Prisma } from "@/generated/prisma/client";

/** Successful personal additions only; never rank by other people's edits or extend event retention. */
export function recentHarumadiIds(tx: Pick<Prisma.TransactionClient, "$queryRaw">, userId: string, together: boolean, now = new Date()) {
  return tx.$queryRaw<Array<{ id: string }>>`
    SELECT e.book_id AS id FROM lifecycle_events e
    JOIN harumadis b ON b.id = e.book_id
    WHERE e.user_id = ${userId} AND e.name IN ('madi_added', 'madi_created')
      AND e.retention_until > ${now}
      AND (b.owner_id = ${userId} OR (${together} AND EXISTS (
        SELECT 1 FROM harumadi_members m
        WHERE m.harumadi_id = b.id AND m.user_id = ${userId} AND m.ended_at IS NULL
      )))
    GROUP BY e.book_id ORDER BY MAX(e.occurred_at) DESC, e.book_id DESC LIMIT 3`;
}
