import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { deleteHarumadi, readHarumadi, updateHarumadi, HarumadiError } from "@/server/harumadi/service";
import { parseHarumadiUpdate } from "@/shared/api/harumadi";
export const runtime = "nodejs";
type Context = { params: Promise<{ harumadiId: string }> };
export function GET(request: Request, context: Context) {
  return harumadiRequest(request, async owner => ({ harumadi: await readHarumadi(owner, (await context.params).harumadiId) }));
}
export function PATCH(request: Request, context: Context) {
  return harumadiRequest(request, async owner => {
    const input = parseHarumadiUpdate(await readHarumadiBody(request));
    if (!input) throw new HarumadiError("하루마디 설정과 선택한 기록을 확인해주세요.");
    return { harumadi: await updateHarumadi(owner, (await context.params).harumadiId, input) };
  });
}
export function DELETE(request: Request, context: Context) {
  return harumadiRequest(request, async owner => {
    await deleteHarumadi(owner, (await context.params).harumadiId); return { deleted: true };
  });
}
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
