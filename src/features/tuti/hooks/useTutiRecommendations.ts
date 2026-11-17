"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { recommendationConditionsKey, recommendationRegionKey, reusableRecommendation } from "@/features/tuti/recommendationSnapshot";
import { fetchRecommendations } from "@/lib/tutiApi";
import { interpretState } from "@/lib/recommendations";
import { hasRecommendationArea } from "@/shared/location/recommendationArea";
import { isSessionCurrent } from "@/lib/auth/session";
import { getLocationTermsVersion } from "@/shared/location/terms";
import { withDefaultIntakeAnswers } from "@/lib/intakePreferences";
import { useTutiStore } from "@/store/tuti";
import type { DogOuting } from "@/shared/pets/dogAccess";
import { useSession } from "./useSession";

export function useTutiRecommendations({ enabled = true, dogOuting }: { enabled?: boolean; dogOuting?: DogOuting } = {}) {
  const session = useSession();
  const ownerId = session?.userId;
  const snapshot = useTutiStore(state => state.dailyRecommendation);
  const hasHydrated = useTutiStore(state => state.hasHydrated);
  const consent = useTutiStore(state => state.locationConsent);
  const storedAnswers = useTutiStore((state) => state.answers);
  const entryRecord = useTutiStore((state) => state.entryRecord);
  const userLocation = useTutiStore((state) => state.userLocation);
  const preferredRegion = useTutiStore((state) => state.preferredRegion);
  const recommendationCycle = useTutiStore(
    (state) => state.recommendationCycle,
  );
  const recommendationExcludedPlaceIds = useTutiStore(
    (state) => state.recommendationExcludedPlaceIds,
  );
  const savedDeparturePlaces = useTutiStore(
    (state) => state.savedDeparturePlaces,
  );
  const answers = useMemo(
    () => withDefaultIntakeAnswers(storedAnswers),
    [storedAnswers],
  );
  const feature = useMemo(() => interpretState(answers), [answers]);
  const inputFingerprint = recommendationConditionsKey(answers, dogOuting);
  const locationAllowed = consent?.status === "accepted" && consent.termsVersion === getLocationTermsVersion();
  const cached = reusableRecommendation(snapshot, {
    ownerId, cycle: recommendationCycle, conditionsKey: inputFingerprint,
    location: userLocation, region: preferredRegion,
  });
  const usableCache = cached?.locationAnchor && !locationAllowed ? undefined : cached;
  const origin = usableCache?.locationAnchor ?? userLocation;
  const regionKey = recommendationRegionKey(preferredRegion);
  const regionSelectionRequired = !hasRecommendationArea(userLocation, preferredRegion) && !usableCache;
  const { data, ...query } = useQuery({
    queryKey: [
      "recommendations",
      ownerId ?? null,
      recommendationCycle,
      inputFingerprint,
      origin?.latitude ?? null, origin?.longitude ?? null, regionKey,
    ],
    queryFn: async ({ signal }) => {
      const response = await fetchRecommendations(
        answers,
        origin,
        entryRecord?.status,
        preferredRegion,
        recommendationExcludedPlaceIds,
        savedDeparturePlaces.map((place) => place.placeId),
        signal,
        dogOuting,
      );
      const current = useTutiStore.getState();
      const currentDogOuting = current.recommendationDogOuting?.ownerId === ownerId ? current.recommendationDogOuting?.value : undefined;
      // 철회·계정 전환·조건 변경 전에 시작한 요청은 영속 목록을 되살리지 않는다.
      if (!signal.aborted && session && isSessionCurrent(session) &&
        current.recommendationCycle === recommendationCycle &&
        recommendationConditionsKey(withDefaultIntakeAnswers(current.answers), currentDogOuting) === inputFingerprint &&
        recommendationRegionKey(current.preferredRegion) === regionKey &&
        (!origin || (current.locationConsent?.status === "accepted" && current.locationConsent.termsVersion === getLocationTermsVersion() && current.locationConsent.updatedAt === consent?.updatedAt))) {
        current.cacheDailyRecommendation(response.recommendationId, response.algorithmVersion, response.places, inputFingerprint,
          { ownerId, locationAnchor: origin, regionKey });
      }
      return response;
    },
    initialData: usableCache ? { recommendationId: usableCache.recommendationId, algorithmVersion: usableCache.algorithmVersion, places: usableCache.places } : undefined,
    enabled: enabled && hasHydrated && Boolean(ownerId) && !regionSelectionRequired,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!data || !session || !ownerId || !isSessionCurrent(session) || (origin && !locationAllowed)) return;
    const current = useTutiStore.getState();
    if (current.dailyRecommendation?.recommendationId === data.recommendationId && current.dailyRecommendation.ownerId === ownerId &&
      current.dailyRecommendation.cycle === recommendationCycle && current.dailyRecommendation.inputFingerprint === inputFingerprint) return;
    if (current.recommendationCycle !== recommendationCycle) return;
    if (origin && (current.locationConsent?.status !== "accepted" || current.locationConsent.updatedAt !== consent?.updatedAt)) return;
    const currentDog = current.recommendationDogOuting?.ownerId === ownerId ? current.recommendationDogOuting?.value : undefined;
    if (recommendationConditionsKey(withDefaultIntakeAnswers(current.answers), currentDog) !== inputFingerprint || recommendationRegionKey(current.preferredRegion) !== regionKey) return;
    current.cacheDailyRecommendation(data.recommendationId, data.algorithmVersion, data.places, inputFingerprint,
      { ownerId, locationAnchor: origin, regionKey });
  }, [data, ownerId, origin, regionKey, inputFingerprint, recommendationCycle, locationAllowed, consent?.updatedAt, session]);

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
