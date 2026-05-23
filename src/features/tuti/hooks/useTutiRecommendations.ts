"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchRecommendations } from "@/lib/tutiApi";
import { interpretState } from "@/lib/recommendations";
import { useTutiStore } from "@/store/tuti";

export function useTutiRecommendations() {
  const answers = useTutiStore((state) => state.answers);
  const feature = useMemo(() => interpretState(answers), [answers]);
  const { data: places = [], ...query } = useQuery({
    queryKey: ["recommendations", answers],
    queryFn: () => fetchRecommendations(answers),
    staleTime: Infinity,
  });

  return {
    answers,
    feature,
    places,
    ...query,
  };
}
