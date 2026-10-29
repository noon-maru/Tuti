import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { eraseComment, readComments, saveComment } from "@/server/harumadi/comments";
import { HarumadiError } from "@/server/harumadi/errors";
export const runtime = "nodejs";
type Context = { params: Promise<{ harumadiId: string }> };
export function GET(request: Request, context: Context) {
  return harumadiRequest(request, async userId => {
    const params = new URL(request.url).searchParams;
    return readComments(userId, (await context.params).harumadiId, params.get("parentId"), params.get("cursor"));
  });
}
export function POST(request: Request, context: Context) {
  return harumadiRequest(request, async userId => saveComment(userId, (await context.params).harumadiId, await readHarumadiBody(request)));
}
export function PATCH(request: Request, context: Context) {
  return harumadiRequest(request, async userId => {
    const input = await readHarumadiBody(request) as Record<string, unknown>;
    if (!input || typeof input.commentId !== "string" || typeof input.revision !== "number") throw new HarumadiError("댓글을 확인해주세요.");
    return saveComment(userId, (await context.params).harumadiId, input, input.commentId, input.revision);
  });
}
export function DELETE(request: Request, context: Context) {
  return harumadiRequest(request, async userId => {
    const id = new URL(request.url).searchParams.get("commentId");
    if (!id) throw new HarumadiError("댓글을 확인해주세요.");
    await eraseComment(userId, (await context.params).harumadiId, id); return { deleted: true };
  });
}
export const OPTIONS = createPreflightResponse;
