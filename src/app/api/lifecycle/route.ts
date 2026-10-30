import { prisma } from "@/server/db/prisma";
import { authenticateUser } from "@/server/auth/session";
import { guardServiceTerms } from "@/server/legal/requestGuard";
import { createPreflightResponse, isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { consumeRateLimit } from "@/server/http/rateLimit";
import { parseLifecycleInput } from "@/shared/api/lifecycle";
import { recordLifecycle } from "@/server/analytics/lifecycle";
import { requireHarumadiAccess } from "@/server/harumadi/access";
import { koreanDay } from "@/server/admin/analyticsScope";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => withCors(request, Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }));
  if (!isRequestOriginAllowed(request)) return reply({ error: "허용되지 않은 요청 출처예요." }, 403);
  try {
    const denied = await guardServiceTerms(request);
    if (denied) return denied;
    const user = await authenticateUser(request);
    if (!user) return reply({ error: "사용자 확인이 필요해요." }, 401);
    if (!consumeRateLimit(user.id, { id: "lifecycle", limit: 120, windowMs: 60_000 }).allowed) return reply({ error: "잠시 후 다시 시도해주세요." }, 429);
    const text = await request.text();
    if (text.length > 2048) return reply({ error: "관측 요청을 확인해주세요." }, 400);
    const input = parseLifecycleInput(JSON.parse(text));
    if (!input) return reply({ error: "관측 요청을 확인해주세요." }, 400);
    const now = Date.now(), observed = input.observedAt ? Date.parse(input.observedAt) : now;
    if (observed < now - 30 * 60_000 || observed > now + 60_000) return reply({ error: "관측 시각을 확인해주세요." }, 400);
    const occurredAt = new Date(Math.min(now, observed));
    await prisma.$transaction(async tx => {
      if (input.name === "book_opened") {
        if (!input.entityId) throw new Error("BOOK_REQUIRED");
        await requireHarumadiAccess(tx, user.id, input.entityId);
      }
      if (input.name === "pdf_exported" && input.entityId && !await tx.harumadiPdf.findFirst({ where: { id: input.entityId, ownerId: user.id }, select: { id: true } })) throw new Error("PDF_REQUIRED");
      const key = input.name === "daily_active" ? `day:${user.id}:${koreanDay(occurredAt)}` : `client:${user.id}:${input.id}`;
      await recordLifecycle(tx, user.id, { name: input.name, key, entityId: input.entityId,
        ...(input.name === "book_opened" ? { bookId: input.entityId } : {}), origin: input.origin }, input, occurredAt);
    });
    return reply({ recorded: true }, 201);
  } catch { return reply({ error: "관측을 저장하지 못했어요." }, 400); }
}
export const OPTIONS = createPreflightResponse;
