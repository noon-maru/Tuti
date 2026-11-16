"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { createRecommendationInputFingerprint } from "@/features/tuti/recommendationInputFingerprint";
import { fetchRecommendations } from "@/lib/tutiApi";
import {
  getKoreanDateKey,
} from "@/lib/date/koreanDate";
import { interpretState } from "@/lib/recommendations";
import { hasRecommendationArea } from "@/shared/location/recommendationArea";
import { RECOMMENDATION_ALGORITHM_VERSION } from "@/shared/api/recommendations";
import { withDefaultIntakeAnswers } from "@/lib/intakePreferences";
import { useTutiStore } from "@/store/tuti";
import type { DogOuting } from "@/shared/pets/dogAccess";
import { useSession } from "./useSession";

export function useTutiRecommendations({ enabled = true, dogOuting }: { enabled?: boolean; dogOuting?: DogOuting } = {}) {
  const ownerId = useSession()?.userId;
  const storedAnswers = useTutiStore((state) => state.answers);
  const entryRecord = useTutiStore((state) => state.entryRecord);
  const userLocation = useTutiStore((state) => state.userLocation);
  const preferredRegion = useTutiStore((state) => state.preferredRegion);
  const dailyRecommendation = useTutiStore(
    (state) => state.dailyRecommendation,
  );
  const recommendationCycle = useTutiStore(
    (state) => state.recommendationCycle,
  );
  const recommendationExcludedPlaceIds = useTutiStore(
    (state) => state.recommendationExcludedPlaceIds,
  );
  const savedDeparturePlaces = useTutiStore(
    (state) => state.savedDeparturePlaces,
  );
  const cacheDailyRecommendation = useTutiStore(
    (state) => state.cacheDailyRecommendation,
  );
  const recommendationDate = getKoreanDateKey();
  const answers = useMemo(
    () => withDefaultIntakeAnswers(storedAnswers),
    [storedAnswers],
  );
  const feature = useMemo(() => interpretState(answers), [answers]);
  const inputFingerprint = useMemo(
    () =>
      createRecommendationInputFingerprint({
        answers,
        userLocation,
        preferredRegion,
        excludedPlaceIds: recommendationExcludedPlaceIds,
        entryStatus: entryRecord?.status,
      }),
    [
      answers,
      entryRecord?.status,
      preferredRegion,
      recommendationExcludedPlaceIds,
      userLocation,
    ],
  );
  const cachedRecommendation =
    !dogOuting && dailyRecommendation?.effectiveDate === recommendationDate &&
    dailyRecommendation.cycle === recommendationCycle &&
    dailyRecommendation.algorithmVersion ===
      RECOMMENDATION_ALGORITHM_VERSION &&
    dailyRecommendation.inputFingerprint === inputFingerprint
      ? {
          recommendationId: dailyRecommendation.recommendationId,
          algorithmVersion: dailyRecommendation.algorithmVersion,
          places: dailyRecommendation.places,
        }
      : undefined;
  const regionSelectionRequired = !hasRecommendationArea(userLocation, preferredRegion);
  const { data, ...query } = useQuery({
    queryKey: [
      "recommendations",
      recommendationDate,
      recommendationCycle,
      RECOMMENDATION_ALGORITHM_VERSION,
      inputFingerprint,
      dogOuting ?? null,
      dogOuting ? ownerId : null,
    ],
    queryFn: ({ signal }) =>
      fetchRecommendations(
        answers,
        userLocation,
        entryRecord?.status,
        preferredRegion,
        recommendationExcludedPlaceIds,
        savedDeparturePlaces.map((place) => place.placeId),
        signal,
        dogOuting,
      ),
    enabled: enabled && !regionSelectionRequired,
    initialData: cachedRecommendation,
    staleTime: dogOuting ? 0 : Infinity,
    ...(dogOuting ? { gcTime: 0 } : {}),
  });

  useEffect(() => {
    const current = useTutiStore.getState();
    if (dogOuting) return;
    if (userLocation && (current.userLocation !== userLocation || current.locationConsent?.status !== "accepted")) return;
    if (
      !data?.recommendationId ||
      (dailyRecommendation?.effectiveDate === recommendationDate &&
        dailyRecommendation.cycle === recommendationCycle &&
        dailyRecommendation.recommendationId === data.recommendationId &&
        dailyRecommendation.algorithmVersion === data.algorithmVersion &&
        dailyRecommendation.inputFingerprint === inputFingerprint)
    ) {
      return;
    }

    cacheDailyRecommendation(
      data.recommendationId,
      data.algorithmVersion,
      data.places,
      inputFingerprint,
    );
  }, [
    cacheDailyRecommendation,
    dailyRecommendation,
    data,
    inputFingerprint,
    recommendationCycle,
    recommendationDate,
    userLocation,
    dogOuting,
  ]);

  return {
    answers,
    feature,
    places: data?.places ?? [],
    recommendationId: data?.recommendationId,
    userLocation,
    preferredRegion,
    regionSelectionRequired,
    ...query,
  };
}
