import { createPreflightResponse } from "@/server/http/cors";
import { harumadiRequest, readHarumadiBody } from "@/server/harumadi/http";
import { createPet, readPets } from "@/server/pets/service";
export const runtime = "nodejs";
export const GET = (request: Request) => harumadiRequest(request, async owner => ({ pets: await readPets(owner) }));
export const POST = (request: Request) => harumadiRequest(request, async owner => ({ pet: await createPet(owner, await readHarumadiBody(request)) }));
export const OPTIONS = createPreflightResponse;
