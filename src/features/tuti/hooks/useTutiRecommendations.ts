"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { createRecommendationInputFingerprint } from "@/features/tuti/recommendationInputFingerprint";
import { fetchRecommendations } from "@/lib/tutiApi";
import {
  getKoreanDateKey,
  isCurrentKoreanDate,
} from "@/lib/date/koreanDate";
import { interpretState } from "@/lib/recommendations";
import { RECOMMENDATION_ALGORITHM_VERSION } from "@/shared/api/recommendations";
import { useTutiStore } from "@/store/tuti";

export function useTutiRecommendations({ enabled = true } = {}) {
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
  const cacheDailyRecommendation = useTutiStore(
    (state) => state.cacheDailyRecommendation,
  );
  const recommendationDate = getKoreanDateKey();
  const skippedToday =
    isCurrentKoreanDate(entryRecord) && entryRecord?.status === "skipped";
  const answers = useMemo(
    () => (skippedToday ? {} : storedAnswers),
    [skippedToday, storedAnswers],
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
    dailyRecommendation?.effectiveDate === recommendationDate &&
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
  const { data, ...query } = useQuery({
    queryKey: [
      "recommendations",
      recommendationDate,
      recommendationCycle,
      RECOMMENDATION_ALGORITHM_VERSION,
      inputFingerprint,
    ],
    queryFn: () =>
      fetchRecommendations(
        answers,
        userLocation,
        entryRecord?.status,
        preferredRegion,
        recommendationExcludedPlaceIds,
      ),
    enabled,
    initialData: cachedRecommendation,
    staleTime: Infinity,
  });

  useEffect(() => {
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
  ]);

  return {
    answers,
    feature,
    places: data?.places ?? [],
    recommendationId: data?.recommendationId,
    userLocation,
    preferredRegion,
    ...query,
  };
}
