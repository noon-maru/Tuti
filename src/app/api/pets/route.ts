import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { createPet, readPets } from "@/server/pets/service";
export const runtime = "nodejs";
export const GET = (request: Request) => harumadiRequest(request, async owner => ({ pets: await readPets(owner) }), "프로필을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
export const POST = (request: Request) => harumadiRequest(request, async owner => ({ pet: await createPet(owner, await readHarumadiBody(request, 740_000)) }), "프로필을 등록하지 못했어요. 잠시 후 다시 시도해주세요.");
export const OPTIONS = createPreflightResponse;
