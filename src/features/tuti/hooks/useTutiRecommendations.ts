"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchRecommendations } from "@/lib/tutiApi";
import { isCurrentKoreanDate } from "@/lib/date/koreanDate";
import { interpretState } from "@/lib/recommendations";
import { useTutiStore } from "@/store/tuti";

export function useTutiRecommendations({ enabled = true } = {}) {
  const storedAnswers = useTutiStore((state) => state.answers);
  const entryRecord = useTutiStore((state) => state.entryRecord);
  const userLocation = useTutiStore((state) => state.userLocation);
  const preferredRegion = useTutiStore((state) => state.preferredRegion);
  const answers =
    isCurrentKoreanDate(entryRecord) && entryRecord?.status === "skipped"
      ? {}
      : storedAnswers;
  const feature = useMemo(() => interpretState(answers), [answers]);
  const { data, ...query } = useQuery({
    queryKey: [
      "recommendations",
      answers,
      Boolean(userLocation),
      userLocation ? null : preferredRegion?.areaCode,
      entryRecord?.effectiveDate,
      entryRecord?.status,
    ],
    queryFn: () =>
      fetchRecommendations(
        answers,
        userLocation,
        entryRecord?.status,
        preferredRegion,
      ),
    enabled,
    staleTime: Infinity,
  });

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
