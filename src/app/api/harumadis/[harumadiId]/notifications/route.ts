import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { HarumadiError } from "@/server/harumadi/errors";
import { bookNotificationSettings } from "@/server/notifications/settings";
type Context = { params: Promise<{ harumadiId: string }> };
export const runtime = "nodejs";
export const GET = (request: Request, context: Context) => harumadiRequest(request, async user => bookNotificationSettings(user, (await context.params).harumadiId));
export const PUT = (request: Request, context: Context) => harumadiRequest(request, async user => {
  const input = await readHarumadiBody(request) as { muted?: unknown };
  if (typeof input?.muted !== "boolean") throw new HarumadiError("알림 설정을 확인해주세요.");
  return bookNotificationSettings(user, (await context.params).harumadiId, input.muted);
});
export const OPTIONS = createPreflightResponse;
