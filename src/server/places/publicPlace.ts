import { cache } from "react";
import type { TutiPlace } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { recommendablePlaceWhere } from "@/server/recommendations/recommendablePlaceWhere";
import {
  toPublicPlaceName,
  toPublicSidoName,
} from "@/server/places/publicPlaceLabels";

export const findPublicPlace = cache(
  async (placeId: string): Promise<TutiPlace | null> => {
    const place = await prisma.place.findFirst({
      where: {
        id: placeId,
        ...recommendablePlaceWhere,
      },
      select: {
        id: true,
        name: true,
        phrase: true,
        note: true,
        image: true,
        travelTime: true,
        crowd: true,
        today: true,
        fatigue: true,
        movementLevel: true,
        moodTags: true,
        sourceContentType: true,
        sourceSidoName: true,
        sourceSigunguName: true,
        latitude: true,
        longitude: true,
      },
    });

    if (!place) return null;

    return {
      ...place,
      name: toPublicPlaceName(
        place.name,
        place.sourceSidoName,
        place.sourceSigunguName,
      ),
      sourceContentType: place.sourceContentType ?? undefined,
      sourceSidoName:
        toPublicSidoName(place.sourceSidoName, place.sourceSigunguName) ??
        undefined,
      sourceSigunguName: place.sourceSigunguName ?? undefined,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
    };
  },
);
