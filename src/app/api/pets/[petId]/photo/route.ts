import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest } from "@/server/harumadi/http";
import { readPetPhoto } from "@/server/pets/service";
export const runtime = "nodejs";
export const GET = (request: Request, context: { params: Promise<{ petId: string }> }) =>
  harumadiRequest(request, async owner => readPetPhoto(owner, (await context.params).petId), "사진을 불러오지 못했어요. 다시 시도해주세요.");
export const OPTIONS = createPreflightResponse;
