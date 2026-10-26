import { authenticateUser } from "@/server/auth/session";
import { isRequestOriginAllowed, withCors } from "@/server/http/cors";
import { guardServiceTerms } from "@/server/legal/requestGuard";
import { SensitiveJournalPolicyError } from "./sensitivePolicy";
import { NotebookError } from "./notebooks";

export async function notebookRequest(request: Request, action: (ownerId: string) => Promise<unknown>) {
  const respond = (body: unknown, status = 200) => withCors(request, Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }));
  if (!isRequestOriginAllowed(request)) return respond({ error: "허용되지 않은 요청 출처예요." }, 403);
  try {
    const denied = await guardServiceTerms(request);
    if (denied) return denied;
    const user = await authenticateUser(request);
    if (!user) return respond({ error: "사용자 인증이 필요해요." }, 401);
    return respond(await action(user.id));
  } catch (error) {
    if (error instanceof NotebookError || error instanceof SensitiveJournalPolicyError) return respond({ error: error.message }, error.status);
    return respond({ error: "기록집을 저장하거나 불러오지 못했어요. 잠시 후 다시 시도해주세요." }, 503);
  }
}
export async function readNotebookBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new NotebookError("기록집 설정을 확인해주세요.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 16_384) { await reader.cancel(); throw new NotebookError("기록집 입력이 너무 길어요.", 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new NotebookError("기록집 입력을 확인해주세요."); }
}
