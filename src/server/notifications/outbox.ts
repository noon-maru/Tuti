import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

export type TogetherNotificationKind = "shared-madi" | "invite-accepted" | "comment-reply";
export async function enqueueTogetherNotification(tx: Prisma.TransactionClient, actorId: string, bookId: string, kind: TogetherNotificationKind, entityId: string, recipientId?: string) {
  // Domain adapters without the push subsystem do not emit notifications.
  if (!tx.pushDevice) return;
  await tx.$executeRaw`INSERT INTO notification_jobs(id,user_id,actor_id,book_id,kind,entity_id,due_at)
    SELECT ${randomUUID()} || ':' || u.id, u.id, ${actorId}, b.id, ${kind}, ${entityId},
      CURRENT_TIMESTAMP + (${kind === "shared-madi" ? 180 : 0} * interval '1 second')
    FROM harumadis b JOIN users u ON (u.id=b.owner_id OR EXISTS(SELECT 1 FROM harumadi_members m WHERE m.harumadi_id=b.id AND m.user_id=u.id AND m.ended_at IS NULL))
    JOIN notification_preferences p ON p.user_id=u.id AND p.news_enabled
    WHERE b.id=${bookId} AND b.collaboration_started_at IS NOT NULL AND u.id<>${actorId}
      AND (${recipientId ?? null}::text IS NULL OR u.id=${recipientId ?? null})
      AND NOT EXISTS(SELECT 1 FROM notification_book_settings s WHERE s.user_id=u.id AND s.book_id=b.id AND s.muted)
    ON CONFLICT (id) DO NOTHING`;
}
