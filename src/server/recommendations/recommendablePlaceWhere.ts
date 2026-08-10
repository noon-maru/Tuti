import type { Prisma } from "@/generated/prisma/client";

export const candidatePoolPlaceWhere: Prisma.PlaceWhereInput = {
  source: "tourapi",
  OR: [
    { candidateOverride: "include" },
    { candidateOverride: "auto", candidateStatus: "selected" },
  ],
};

export const recommendablePlaceWhere: Prisma.PlaceWhereInput = {
  AND: [
    candidatePoolPlaceWhere,
    {
      isActive: true,
      reviewStatus: "approved",
    },
  ],
};
