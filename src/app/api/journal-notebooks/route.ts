import { createPreflightResponse } from "@/server/http/cors";
import { notebookRequest, readNotebookBody } from "@/server/journal/notebookHttp";
import { createNotebook, listNotebooks, NotebookError } from "@/server/journal/notebooks";
import { parseNotebookSettings } from "@/shared/api/journalNotebook";
export const runtime = "nodejs";
export function GET(request: Request) {
  return notebookRequest(request, owner => listNotebooks(owner, new URL(request.url).searchParams.get("cursor")));
}
export function POST(request: Request) {
  return notebookRequest(request, async owner => {
    const settings = parseNotebookSettings(await readNotebookBody(request));
    if (!settings) throw new NotebookError("제목·표지·속지를 확인해주세요.");
    return { notebook: await createNotebook(owner, settings) };
  });
}
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
