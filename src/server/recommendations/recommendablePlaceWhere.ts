import type { Prisma } from "@/generated/prisma/client";

export const recommendablePlaceWhere: Prisma.PlaceWhereInput = {
  source: "tourapi",
  isActive: true,
  reviewStatus: { not: "rejected" },
  OR: [
    { candidateOverride: "include" },
    { candidateOverride: "auto", candidateStatus: "selected" },
  ],
};
