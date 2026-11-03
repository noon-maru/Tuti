import { prisma } from "@/server/db/prisma";
import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { HarumadiError } from "@/server/harumadi/errors";
import { randomUUID } from "node:crypto";
import { consumeRateLimit } from "@/server/http/rateLimit";
export const runtime = "nodejs";
export const POST = (request: Request) => harumadiRequest(request, async user => {
  const input = await readHarumadiBody(request) as Record<string, unknown>;
  if (input?.kind === "permission" && ["permission-requested", "permission-granted", "permission-denied"].includes(String(input.action))) {
    if (!consumeRateLimit(user, { id: "notification-permission", limit: 12, windowMs: 60_000 }).allowed) throw new HarumadiError("잠시 후 다시 시도해주세요.", 429);
    await prisma.$executeRaw`INSERT INTO notification_events(id,user_id,kind,action) VALUES (${randomUUID()},${user},'permission',${String(input.action)})`;
    return { ok: true };
  }
  if (!input || typeof input.notificationId !== "string" || input.notificationId.length > 200 || !["opened", "written"].includes(String(input.action))) throw new HarumadiError("알림을 확인해주세요.");
  await prisma.$executeRaw`INSERT INTO notification_events(id,user_id,kind,action)
    SELECT ${`${input.action}:${input.notificationId}`},${user},j.kind,${String(input.action)} FROM notification_jobs j
    WHERE j.id=${input.notificationId} AND j.user_id=${user} AND j.consumed_at IS NOT NULL
      AND j.created_at>CURRENT_TIMESTAMP-interval '1 day'
      AND (${input.action === "opened"} OR (j.kind='madi-reminder'
        AND EXISTS(SELECT 1 FROM notification_events e WHERE e.user_id=${user} AND e.id=${`opened:${input.notificationId}`})
        AND EXISTS(SELECT 1 FROM journal_entries m WHERE m.owner_id=${user} AND m.created_at>CURRENT_TIMESTAMP-interval '2 minutes')))
    ON CONFLICT(id) DO NOTHING`;
  return { ok: true };
});
export const OPTIONS = createPreflightResponse;
