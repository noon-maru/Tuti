import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { HarumadiError } from "@/server/harumadi/errors";
import { readNotificationSettings, saveNotificationSettings } from "@/server/notifications/settings";
import { parseNotificationSettings } from "@/shared/notifications/preferences";
export const runtime = "nodejs";
export const GET = (request: Request) => harumadiRequest(request, user => readNotificationSettings(user));
export const PUT = (request: Request) => harumadiRequest(request, async user => {
  const input = parseNotificationSettings(await readHarumadiBody(request));
  if (!input) throw new HarumadiError("알림 설정을 확인해주세요.");
  return saveNotificationSettings(user, input);
});
export const OPTIONS = createPreflightResponse;
