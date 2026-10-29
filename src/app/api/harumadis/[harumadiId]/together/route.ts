import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { acceptInvite, inspectInvite, addSharedEntry, createInvite, leaveHarumadi, readTogether, removeSharedEntry, revokeInvite } from "@/server/harumadi/together";
import { HarumadiError } from "@/server/harumadi/errors";
import { consumeRateLimit } from "@/server/http/rateLimit";
import { blockTogetherUser, reportSharedTarget } from "@/server/harumadi/moderation";
export const runtime = "nodejs";
type Context = { params: Promise<{ harumadiId: string }> };
export function GET(request: Request, context: Context) {
  return harumadiRequest(request, async userId => readTogether(userId, (await context.params).harumadiId));
}
export function POST(request: Request, context: Context) {
  return harumadiRequest(request, async userId => {
    const { harumadiId } = await context.params;
    const body = await readHarumadiBody(request) as Record<string, unknown>;
    if (!body || typeof body !== "object") throw new HarumadiError("요청을 확인해주세요.");
    if (!consumeRateLimit(userId, { id: "harumadi-together", limit: 30, windowMs: 60_000 }).allowed) throw new HarumadiError("잠시 후 다시 시도해주세요.", 429);
    const target = typeof body.target === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(body.target) ? body.target : "";
    if (body.action === "invite" && body.sharingConfirmed === true) return createInvite(userId, harumadiId);
    if (body.action === "accept" && typeof body.token === "string") return acceptInvite(userId, body.token);
    if (body.action === "inspect-invite" && typeof body.token === "string") return inspectInvite(userId, body.token);
    if (body.action === "leave" || (body.action === "remove-member" && target)) { await leaveHarumadi(userId, harumadiId, body.action === "leave" ? userId : target); return { ended: true }; }
    if (body.action === "revoke-invite" && target) { await revokeInvite(userId, harumadiId, target); return { revoked: true }; }
    if (body.action === "add-entry" && target && body.sharingConfirmed === true) { await addSharedEntry(userId, harumadiId, target); return { added: true }; }
    if (body.action === "remove-entry" && target) { await removeSharedEntry(userId, harumadiId, target); return { removed: true }; }
    if (body.action === "report" && target) return reportSharedTarget(userId, harumadiId, body);
    if (body.action === "block-user" && target) { await blockTogetherUser(userId, harumadiId, target); return { blocked: true }; }
    throw new HarumadiError("함께 채우기 요청을 확인해주세요.");
  });
}
export const OPTIONS = createPreflightResponse;
