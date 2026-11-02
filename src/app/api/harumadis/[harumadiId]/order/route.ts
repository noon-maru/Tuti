import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { HarumadiError, reorderHarumadi } from "@/server/harumadi/service";
import { parseHarumadiOrder } from "@/shared/api/harumadi";

export const runtime = "nodejs";
type Context = { params: Promise<{ harumadiId: string }> };
export function PATCH(request: Request, context: Context) {
  return harumadiRequest(request, async owner => {
    const input = parseHarumadiOrder(await readHarumadiBody(request));
    if (!input) throw new HarumadiError("마디 순서를 다시 확인해주세요.");
    return { harumadi: await reorderHarumadi(owner, (await context.params).harumadiId, input) };
  });
}
export const OPTIONS = createPreflightResponse;
