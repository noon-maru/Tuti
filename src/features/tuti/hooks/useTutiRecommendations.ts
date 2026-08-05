"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { fetchRecommendations } from "@/lib/tutiApi";
import {
  getKoreanDateKey,
  isCurrentKoreanDate,
} from "@/lib/date/koreanDate";
import { interpretState } from "@/lib/recommendations";
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
  const answers =
    isCurrentKoreanDate(entryRecord) && entryRecord?.status === "skipped"
      ? {}
      : storedAnswers;
  const feature = useMemo(() => interpretState(answers), [answers]);
  const cachedRecommendation =
    dailyRecommendation?.effectiveDate === recommendationDate &&
    dailyRecommendation.cycle === recommendationCycle
      ? {
          recommendationId: dailyRecommendation.recommendationId,
          places: dailyRecommendation.places,
        }
      : undefined;
  const { data, ...query } = useQuery({
    queryKey: [
      "recommendations",
      recommendationDate,
      recommendationCycle,
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
        dailyRecommendation.recommendationId === data.recommendationId)
    ) {
      return;
    }

    cacheDailyRecommendation(data.recommendationId, data.places);
  }, [
    cacheDailyRecommendation,
    dailyRecommendation,
    data,
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
