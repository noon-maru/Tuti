import { createPreflightResponse } from "@/server/http/cors";
import { notebookRequest, readNotebookBody } from "@/server/journal/notebookHttp";
import { deleteNotebook, readNotebook, updateNotebook, NotebookError } from "@/server/journal/notebooks";
import { parseNotebookUpdate } from "@/shared/api/journalNotebook";
export const runtime = "nodejs";
type Context = { params: Promise<{ notebookId: string }> };
export function GET(request: Request, context: Context) {
  return notebookRequest(request, async owner => ({ notebook: await readNotebook(owner, (await context.params).notebookId) }));
}
export function PATCH(request: Request, context: Context) {
  return notebookRequest(request, async owner => {
    const input = parseNotebookUpdate(await readNotebookBody(request));
    if (!input) throw new NotebookError("기록집 설정과 선택한 기록을 확인해주세요.");
    return { notebook: await updateNotebook(owner, (await context.params).notebookId, input) };
  });
}
export function DELETE(request: Request, context: Context) {
  return notebookRequest(request, async owner => {
    await deleteNotebook(owner, (await context.params).notebookId); return { deleted: true };
  });
}
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
