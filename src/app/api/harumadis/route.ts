import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { createHarumadi, listHarumadis, HarumadiError } from "@/server/harumadi/service";
import { parseHarumadiSettings } from "@/shared/api/harumadi";
export const runtime = "nodejs";
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return harumadiRequest(request, owner => listHarumadis(owner, params.get("cursor"), params.get("q") ?? ""));
}
export function POST(request: Request) {
  return harumadiRequest(request, async owner => {
    const settings = parseHarumadiSettings(await readHarumadiBody(request));
    if (!settings) throw new HarumadiError("이름과 표지를 확인해주세요.");
    return { harumadi: await createHarumadi(owner, settings) };
  });
}
export function OPTIONS(request: Request) { return createPreflightResponse(request); }
