import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { deletePet, updatePet } from "@/server/pets/service";
export const runtime = "nodejs";
export const DELETE = async (request: Request, context: { params: Promise<{ petId: string }> }) => harumadiRequest(request, async owner => deletePet(owner, (await context.params).petId), "프로필을 삭제하지 못했어요. 잠시 후 다시 확인해주세요.");
export const OPTIONS = createPreflightResponse;
export const PUT = async (request: Request, context: { params: Promise<{ petId: string }> }) => harumadiRequest(request, async owner => ({ pet: await updatePet(owner, (await context.params).petId, await readHarumadiBody(request, 740_000)) }), "프로필을 수정하지 못했어요. 잠시 후 다시 시도해주세요.");
