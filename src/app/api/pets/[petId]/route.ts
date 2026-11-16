import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { deletePet, updatePet } from "@/server/pets/service";
export const runtime = "nodejs";
export const DELETE = async (request: Request, context: { params: Promise<{ petId: string }> }) => harumadiRequest(request, async owner => deletePet(owner, (await context.params).petId));
export const OPTIONS = createPreflightResponse;
export const PUT = async (request: Request, context: { params: Promise<{ petId: string }> }) => harumadiRequest(request, async owner => ({ pet: await updatePet(owner, (await context.params).petId, await readHarumadiBody(request)) }));
