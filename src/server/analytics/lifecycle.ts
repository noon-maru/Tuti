import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { lifecycleContext, type LifecycleContext, type LifecycleName, type LIFECYCLE_ORIGINS } from "@/shared/api/lifecycle";

export function readLifecycleContext(request: Request): LifecycleContext {
  return lifecycleContext({ source: request.headers.get("x-tuti-source"), platform: request.headers.get("x-tuti-platform") ?? request.headers.get("x-tuti-client-platform"),
    appVersion: request.headers.get("x-tuti-version") ?? request.headers.get("x-tuti-client-version"), sessionId: request.headers.get("x-tuti-session"), flowId: request.headers.get("x-tuti-flow") });
}
type Fact = { name: LifecycleName; key: string; entityId?: string; bookId?: string; requestKey?: string; requestHash?: string; origin?: typeof LIFECYCLE_ORIGINS[number] };
export function lifecycleData(userId: string, fact: Fact, context: LifecycleContext = {}, now = new Date()) {
  return { id: randomUUID(), occurrenceKey: fact.key, userId, name: fact.name,
    entityId: fact.entityId, bookId: fact.bookId, requestKey: fact.requestKey, requestHash: fact.requestHash, origin: fact.origin,
    ...lifecycleContext(context), occurredAt: now, retentionUntil: new Date(now.getTime() + 180 * 86_400_000), version: 1 };
}
export async function recordLifecycle(tx: Prisma.TransactionClient, userId: string, fact: Fact, context: LifecycleContext = {}, now = new Date()) {
  // Some isolated domain-test adapters intentionally have no analytics delegate.
  // The generated production delegate always exists; a missing migration fails the transaction.
  if (!tx.lifecycleEvent) return;
  const data = lifecycleData(userId, fact, context, now);
  // Prisma's empty-update upsert may emulate read-then-create and race.
  // PostgreSQL ON CONFLICT DO NOTHING keeps the surrounding transaction usable.
  await tx.lifecycleEvent.createMany({ data: [data], skipDuplicates: true });
}
export async function recordContribution(tx: Prisma.TransactionClient, userId: string, bookId: string, entryId: string, generationId: string, context: LifecycleContext = {}) {
  await recordLifecycle(tx, userId, { name: "madi_added", key: `link:${generationId}`, entityId: entryId, bookId }, context);
  if (!tx.lifecycleEvent) return;
  const book = await tx.harumadi.findUnique({ where: { id: bookId }, select: { ownerId: true, collaborationStartedAt: true } });
  if (!book?.collaborationStartedAt) return;
  const member = book.ownerId === userId ? null : await tx.harumadiMember.findUnique({ where: { harumadiId_userId: { harumadiId: bookId, userId } }, select: { id: true } });
  await recordLifecycle(tx, userId, { name: "shared_first_contribution", key: `contribution:${bookId}:${member?.id ?? userId}`, entityId: member?.id, bookId }, context);
}
