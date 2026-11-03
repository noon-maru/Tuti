import { prisma } from "@/server/db/prisma";
import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { HarumadiError } from "@/server/harumadi/errors";
import { requireHarumadiAccess } from "@/server/harumadi/access";
import { LIFECYCLE_UUID, lifecycleId } from "@/shared/api/lifecycle";
export const runtime = "nodejs";
export const POST = (request: Request) => harumadiRequest(request, async user => {
  const input = await readHarumadiBody(request) as Record<string, unknown>;
  if (!input || !LIFECYCLE_UUID.test(String(input.sessionId)) || typeof input.active !== "boolean" || typeof input.composing !== "boolean" || (input.bookId !== null && !lifecycleId(input.bookId))) throw new HarumadiError("알림 상태를 확인해주세요.");
  const session = String(input.sessionId), book = input.bookId as string | null;
  await prisma.$transaction(async tx => {
    if (!input.active) { await tx.$executeRaw`DELETE FROM notification_presence WHERE user_id=${user} AND session_id=${session}`; return; }
    if (book) await requireHarumadiAccess(tx, user, book);
    // Bound stale rows per account, then upsert only this tab's short-lived lease.
    await tx.$executeRaw`DELETE FROM notification_presence WHERE user_id=${user} AND expires_at<CURRENT_TIMESTAMP`;
    const [count] = await tx.$queryRaw<{ total: bigint }[]>`SELECT count(1) AS total FROM notification_presence WHERE user_id=${user}`;
    if (Number(count.total) >= 20) return;
    await tx.$executeRaw`INSERT INTO notification_presence(user_id,session_id,book_id,composing,expires_at) VALUES (${user},${session},${book},${input.composing},${new Date(Date.now() + 90_000)})
      ON CONFLICT(user_id,session_id) DO UPDATE SET book_id=EXCLUDED.book_id,composing=EXCLUDED.composing,expires_at=EXCLUDED.expires_at`;
  });
  return { ok: true };
});
export const OPTIONS = createPreflightResponse;
