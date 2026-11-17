import type { Prisma } from "@/generated/prisma/client";
import { recommendablePlaceWhere } from "./recommendablePlaceWhere";

/** Independent of low-burden scores, legacy candidate status and automated activation. */
export const dogCatalogPlaceWhere: Prisma.PlaceWhereInput = {
  source: "tourapi", visibilityOverride: { not: "hide" }, candidateOverride: { not: "exclude" },
  dogCatalog: { is: { status: "ready" } },
};
/** A dog recommendation must remain openable in detail, sharing and departure flows. */
export const readablePlaceWhere: Prisma.PlaceWhereInput = { AND: [
  { visibilityOverride: { not: "hide" }, candidateOverride: { not: "exclude" } },
  { OR: [recommendablePlaceWhere, dogCatalogPlaceWhere] },
] };
