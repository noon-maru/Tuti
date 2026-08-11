"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DepartureReturnSheet } from "@/features/tuti/components/DepartureReturnSheet";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { useTravelTime } from "@/features/tuti/hooks/useTravelTime";
import { useSession } from "@/features/tuti/hooks/useSession";
import { useLocationAccess } from "@/features/tuti/location/LocationAccessProvider";
import { DailyCheckInScreen } from "@/features/tuti/screens/intake/DailyCheckInScreen";
import {
  DeparturePlanScreen,
  type DeparturePlace,
} from "@/features/tuti/screens/departure/DeparturePlanScreen";
import { SavedDeparturePlacesSheet } from "@/features/tuti/screens/departure/SavedDeparturePlacesSheet";
import { RecommendationsScreen } from "@/features/tuti/screens/recommendations/RecommendationsScreen";
import {
  formatLongDistanceTravelTimeLabel,
  formatTravelTimeLabel,
} from "@/features/tuti/lib/travelTimeLabel";
import { logoutAccount } from "@/lib/auth/session";
import { recordRecommendationAction } from "@/lib/tutiApi";
import {
  getKoreanDateKey,
  isKoreanDateBefore,
  isCurrentKoreanDate,
} from "@/lib/date/koreanDate";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";
import type { DepartureRoute } from "@/shared/api/departurePlan";
import type { RecommendationActionInput } from "@/shared/api/recommendationActions";
import type { IntakeAnswers } from "@/shared/tuti/types";
import {
  type SavedDeparturePlace,
  useTutiStore,
} from "@/store/tuti";

export function RecommendationsFlow({ interactive }: { interactive: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { requestLocation } = useLocationAccess();
  const session = useSession();
  const automaticLocationRequest = useRef(false);
  const recordedRecommendationIds = useRef(new Set<string>());
  const [currentDate, setCurrentDate] = useState(getKoreanDateKey);
  const [returnCheckInNow, setReturnCheckInNow] = useState(Date.now);
  const [savedPlacesOpen, setSavedPlacesOpen] = useState(false);
  const [selectedSavedPlace, setSelectedSavedPlace] =
    useState<SavedDeparturePlace | null>(null);
  const storedAnswers = useTutiStore((state) => state.answers);
  const userLocation = useTutiStore((state) => state.userLocation);
  const preferredRegion = useTutiStore((state) => state.preferredRegion);
  const locationPermissionStatus = useTutiStore(
    (state) => state.locationPermissionStatus,
  );
  const locationConsent = useTutiStore((state) => state.locationConsent);
  const entryRecord = useTutiStore((state) => state.entryRecord);
  const dailyCheckInRequested = useTutiStore(
    (state) => state.dailyCheckInRequested,
  );
  const dailyCheckInSnoozedUntil = useTutiStore(
    (state) => state.dailyCheckInSnoozedUntil,
  );
  const pendingDeparture = useTutiStore((state) => state.pendingDeparture);
  const setPendingDeparture = useTutiStore(
    (state) => state.setPendingDeparture,
  );
  const postponePendingDeparture = useTutiStore(
    (state) => state.postponePendingDeparture,
  );
  const completePendingDeparture = useTutiStore(
    (state) => state.completePendingDeparture,
  );
  const deferPendingDeparture = useTutiStore(
    (state) => state.deferPendingDeparture,
  );
  const savedDeparturePlaces = useTutiStore(
    (state) => state.savedDeparturePlaces,
  );
  const removeSavedDeparturePlace = useTutiStore(
    (state) => state.removeSavedDeparturePlace,
  );
  const requestDailyCheckIn = useTutiStore(
    (state) => state.requestDailyCheckIn,
  );
  const cancelDailyCheckIn = useTutiStore(
    (state) => state.cancelDailyCheckIn,
  );
  const completeDailyCheckIn = useTutiStore(
    (state) => state.completeDailyCheckIn,
  );
  const refreshDailyRecommendation = useTutiStore(
    (state) => state.refreshDailyRecommendation,
  );
  const snoozeDailyCheckIn = useTutiStore(
    (state) => state.snoozeDailyCheckIn,
  );
  const dailyRecordCurrent = isCurrentKoreanDate(entryRecord, currentDate);
  const dailyCheckInSnoozed = isKoreanDateBefore(
    currentDate,
    dailyCheckInSnoozedUntil,
  );
  const returnCheckInVisible = Boolean(
    interactive &&
      pendingDeparture &&
      new Date(pendingDeparture.promptAfter).getTime() <= returnCheckInNow,
  );
  const dailyCheckInVisible =
    interactive && !returnCheckInVisible &&
    (dailyCheckInRequested || (!dailyRecordCurrent && !dailyCheckInSnoozed));
  const waitingForLocationRestore = Boolean(
    !userLocation &&
      locationConsent?.status === "accepted" &&
      locationConsent.termsVersion === LOCATION_TERMS_VERSION &&
      (locationPermissionStatus === "unknown" ||
        locationPermissionStatus === "prompt" ||
        locationPermissionStatus === "granted"),
  );
  const { places, recommendationId, isSuccess, isPending } =
    useTutiRecommendations({
      enabled:
        (dailyRecordCurrent || dailyCheckInSnoozed) &&
        !waitingForLocationRestore,
    });
  const activeIndex = useTutiStore((state) => state.activeIndex);
  const activePlaceId = useTutiStore((state) => state.activePlaceId);
  const detailOverlay = useTutiStore((state) => state.detailOverlay);
  const hasSeenCardHelp = useTutiStore((state) => state.hasSeenCardHelp);
  const hasSeenSwipeHelp = useTutiStore((state) => state.hasSeenSwipeHelp);
  const hasSeenJournalHelp = useTutiStore((state) => state.hasSeenJournalHelp);
  const hasSeenDepartureHelp = useTutiStore(
    (state) => state.hasSeenDepartureHelp,
  );
  const setActivePlace = useTutiStore((state) => state.setActivePlace);
  const openDetailOverlay = useTutiStore((state) => state.openDetail);
  const beginDetailClose = useTutiStore((state) => state.beginDetailClose);
  const finishDetailClose = useTutiStore((state) => state.finishDetailClose);
  const markCardHelpSeen = useTutiStore((state) => state.markCardHelpSeen);
  const markSwipeHelpSeen = useTutiStore((state) => state.markSwipeHelpSeen);
  const markJournalHelpSeen = useTutiStore((state) => state.markJournalHelpSeen);
  const markDepartureHelpSeen = useTutiStore(
    (state) => state.markDepartureHelpSeen,
  );

  const detailPlaceIndex =
    detailOverlay.placeId
      ? places.findIndex((place) => place.id === detailOverlay.placeId)
      : -1;
  const restoredActiveIndex = activePlaceId
    ? places.findIndex((place) => place.id === activePlaceId)
    : -1;
  const displayedActiveIndex =
    detailOverlay.phase === "open" && detailPlaceIndex >= 0
      ? detailPlaceIndex
      : restoredActiveIndex >= 0
        ? restoredActiveIndex
        : Math.min(activeIndex, Math.max(places.length - 1, 0));
  const activePlace = places[displayedActiveIndex] ?? places[0];
  const detailPlace = detailOverlay.placeId
    ? places.find((place) => place.id === detailOverlay.placeId)
    : undefined;
  const travelTimeQuery = useTravelTime(
    activePlace?.id,
    userLocation,
    interactive &&
      !dailyCheckInVisible &&
      !returnCheckInVisible &&
      !activePlace?.longDistanceJourney,
    activePlace?.travelTimeSummary,
  );
  const activeTravelTimeLabel = activePlace?.longDistanceJourney
    ? formatLongDistanceTravelTimeLabel(activePlace.longDistanceJourney)
    : !userLocation
    ? preferredRegion
      ? `${getShortRegionName(preferredRegion.name)}에서 추천`
      : "위치 없이 추천"
    : travelTimeQuery.isPending
      ? "이동 시간 계산 중"
      : travelTimeQuery.data
        ? formatTravelTimeLabel(travelTimeQuery.data)
        : "이동 시간 확인 필요";

  const recordAction = useCallback((input: RecommendationActionInput) => {
    void recordRecommendationAction(input).catch((error) => {
      console.warn("추천 행동을 기록하지 못했습니다.", error);
    });
  }, []);

  useEffect(() => {
    const refreshCurrentState = () => {
      setCurrentDate(getKoreanDateKey());
      setReturnCheckInNow(Date.now());
    };
    const interval = window.setInterval(refreshCurrentState, 60_000);

    window.addEventListener("focus", refreshCurrentState);
    document.addEventListener("visibilitychange", refreshCurrentState);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshCurrentState);
      document.removeEventListener("visibilitychange", refreshCurrentState);
    };
  }, []);

  useEffect(() => {
    if (
      !recommendationId ||
      !isSuccess ||
      recordedRecommendationIds.current.has(recommendationId)
    ) {
      return;
    }

    recordedRecommendationIds.current.add(recommendationId);
    recordAction({
      journeyId: recommendationId,
      action: "recommendation_shown",
      placeId: activePlace?.id,
      metadata: { placeCount: places.length },
    });
  }, [
    activePlace?.id,
    isSuccess,
    places.length,
    recommendationId,
    recordAction,
  ]);

  useEffect(() => {
    router.prefetch("/journal");
    router.prefetch("/location");
  }, [router]);

  useEffect(() => {
    const canRestoreLocationWithoutPrompt =
      interactive &&
      !userLocation &&
      locationPermissionStatus === "granted" &&
      locationConsent?.status === "accepted" &&
      locationConsent.termsVersion === LOCATION_TERMS_VERSION;

    if (!canRestoreLocationWithoutPrompt) {
      automaticLocationRequest.current = false;
      return;
    }

    if (automaticLocationRequest.current) return;
    automaticLocationRequest.current = true;

    void requestLocation().finally(() => {
      automaticLocationRequest.current = false;
    });
  }, [
    interactive,
    locationConsent,
    locationPermissionStatus,
    requestLocation,
    userLocation,
  ]);

  useEffect(() => {
    if (!isSuccess) {
      return;
    }

    let targetPlaceId = activePlaceId;
    let targetIndex = restoredActiveIndex;

    if (detailOverlay.phase === "open" && detailOverlay.placeId) {
      if (detailPlaceIndex >= 0) {
        targetPlaceId = detailOverlay.placeId;
        targetIndex = detailPlaceIndex;
      } else {
        finishDetailClose();
      }
    }

    if (targetPlaceId && targetIndex >= 0) {
      if (activeIndex !== targetIndex || activePlaceId !== targetPlaceId) {
        setActivePlace(targetIndex, targetPlaceId);
      }
      return;
    }

    const fallbackPlace = places[0];

    if (
      fallbackPlace &&
      (activeIndex !== 0 || activePlaceId !== fallbackPlace.id)
    ) {
      setActivePlace(0, fallbackPlace.id);
    }
  }, [
    activeIndex,
    activePlaceId,
    detailPlaceIndex,
    detailOverlay.phase,
    detailOverlay.placeId,
    finishDetailClose,
    isSuccess,
    places,
    restoredActiveIndex,
    setActivePlace,
  ]);

  const moveCard = (direction: number) => {
    if (!places.length) {
      return;
    }

    const nextIndex =
      (displayedActiveIndex + direction + places.length) % places.length;
    const nextPlace = places[nextIndex];

    setActivePlace(nextIndex, nextPlace.id);
    if (recommendationId) {
      recordAction({
        journeyId: recommendationId,
        action: "place_selected",
        placeId: nextPlace.id,
        metadata: { method: "swipe" },
      });
    }
  };

  const selectCard = (index: number) => {
    const place = places[index];

    if (!place) {
      return;
    }

    setActivePlace(index, place.id);
    if (recommendationId) {
      recordAction({
        journeyId: recommendationId,
        action: "place_selected",
        placeId: place.id,
        metadata: { method: "direct" },
      });
    }
  };

  const startNavigation = (
    place: DeparturePlace,
    route: DepartureRoute,
    journeyId = recommendationId,
  ) => {
    if (!journeyId) return;

    const now = Date.now();
    const routeDuration = Math.max(0, route.durationSeconds ?? 0) * 1_000;
    const promptDelay = Math.max(
      30 * 60 * 1_000,
      Math.min(routeDuration + 30 * 60 * 1_000, 4 * 60 * 60 * 1_000),
    );

    setPendingDeparture({
      journeyId,
      placeId: place.id,
      placeName: place.name,
      placeImage: place.image,
      placePhrase: place.phrase,
      routeMode: route.mode,
      startedAt: new Date(now).toISOString(),
      promptAfter: new Date(now + promptDelay).toISOString(),
    });
    recordAction({
      journeyId,
      action: "navigation_started",
      placeId: place.id,
      routeMode: route.mode,
      metadata: {
        durationSeconds: route.durationSeconds,
        distanceMeters: route.distanceMeters,
      },
    });
  };

  const openDetail = () => {
    if (!activePlace || detailOverlay.phase !== "closed") {
      return;
    }

    openDetailOverlay(activePlace.id);
  };

  const replaceDailyRecommendation = (
    status: "answered" | "reused" | "skipped",
    answers?: IntakeAnswers,
  ) => {
    completeDailyCheckIn(status, answers);
    refreshDailyRecommendation();
    queryClient.removeQueries({ queryKey: ["recommendations"] });
  };

  return (
    <>
      <RecommendationsScreen
        places={places}
        loading={isPending && !dailyCheckInVisible}
        activeIndex={displayedActiveIndex}
        activePlace={activePlace}
        onSelect={selectCard}
        onMove={moveCard}
        detailPhase={detailOverlay.phase}
        detailPlace={detailPlace}
        onDetail={openDetail}
        onDetailExitStart={beginDetailClose}
        onDetailClose={finishDetailClose}
        onJournal={() => router.push("/journal")}
        onAccount={() => router.push("/login")}
        onAdmin={() => router.push("/admin")}
        onInquiry={() => router.push("/inquiry")}
        onLocationSettings={() => router.push("/location")}
        onSavedPlaces={() => setSavedPlacesOpen(true)}
        savedPlacesCount={savedDeparturePlaces.length}
        onDepartureOpen={(place, variant) => {
          if (!recommendationId) return;
          recordAction({
            journeyId: recommendationId,
            action: "departure_peek_opened",
            placeId: place.id,
            metadata: { variant },
          });
        }}
        onDeparturePlanExpanded={(place) => {
          if (!recommendationId) return;
          recordAction({
            journeyId: recommendationId,
            action: "departure_plan_expanded",
            placeId: place.id,
          });
        }}
        onNavigationStart={startNavigation}
        onRestartIntake={requestDailyCheckIn}
        onLogout={async () => {
          await logoutAccount();
          queryClient.setQueryData(["journal-entries"], []);
        }}
        accountConnected={Boolean(session?.account)}
        adminAccess={session?.account?.role === "admin"}
        locationAvailable={Boolean(userLocation)}
        locationPermissionStatus={locationPermissionStatus}
        activeTravelTimeLabel={activeTravelTimeLabel}
        interactive={
          interactive &&
          !dailyCheckInVisible &&
          !returnCheckInVisible &&
          !savedPlacesOpen &&
          !selectedSavedPlace
        }
        initialHelp={
          interactive && detailOverlay.phase === "closed"
            ? !hasSeenCardHelp
              ? "cards"
              : !hasSeenSwipeHelp
                ? "detail"
                : !hasSeenJournalHelp
                  ? "journal"
                  : !hasSeenDepartureHelp
                    ? "departure"
                    : null
            : null
        }
        onInitialHelpShown={(kind) => {
          if (kind === "cards") {
            markCardHelpSeen();
            return;
          }

          if (kind === "detail") {
            markSwipeHelpSeen();
            return;
          }

          if (kind === "journal") {
            markJournalHelpSeen();
            return;
          }

          markDepartureHelpSeen();
        }}
      />
      {dailyCheckInVisible && (
        <DailyCheckInScreen
          previousAnswers={storedAnswers}
          initialMode={dailyCheckInRequested ? "questions" : "summary"}
          dismissible={dailyCheckInRequested || dailyRecordCurrent}
          onReuse={() => replaceDailyRecommendation("reused")}
          onSkip={() => replaceDailyRecommendation("skipped")}
          onSnooze={snoozeDailyCheckIn}
          onSubmit={(answers) =>
            replaceDailyRecommendation("answered", answers)
          }
          onDismiss={cancelDailyCheckIn}
        />
      )}
      {returnCheckInVisible && pendingDeparture && (
        <DepartureReturnSheet
          placeName={pendingDeparture.placeName}
          onVisited={() => {
            recordAction({
              journeyId: pendingDeparture.journeyId,
              action: "return_confirmed",
              placeId: pendingDeparture.placeId,
              routeMode: pendingDeparture.routeMode,
            });
            recordAction({
              journeyId: pendingDeparture.journeyId,
              action: "journal_started",
              placeId: pendingDeparture.placeId,
            });
            const search = new URLSearchParams({
              placeId: pendingDeparture.placeId,
              placeName: pendingDeparture.placeName,
              journeyId: pendingDeparture.journeyId,
            });
            completePendingDeparture();
            router.push(`/journal/new?${search.toString()}`);
          }}
          onNotYet={() => {
            recordAction({
              journeyId: pendingDeparture.journeyId,
              action: "return_dismissed",
              placeId: pendingDeparture.placeId,
            });
            postponePendingDeparture();
          }}
          onLater={() => {
            recordAction({
              journeyId: pendingDeparture.journeyId,
              action: "return_deferred",
              placeId: pendingDeparture.placeId,
            });
            deferPendingDeparture();
          }}
        />
      )}
      {savedPlacesOpen && (
        <SavedDeparturePlacesSheet
          places={savedDeparturePlaces}
          onOpen={(place) => {
            const journeyId =
              place.journeyId || recommendationId || crypto.randomUUID();
            recordAction({
              journeyId,
              action: "departure_plan_expanded",
              placeId: place.placeId,
              metadata: { source: "saved_places" },
            });
            setSavedPlacesOpen(false);
            setSelectedSavedPlace({ ...place, journeyId });
          }}
          onRemove={removeSavedDeparturePlace}
          onClose={() => setSavedPlacesOpen(false)}
        />
      )}
      {selectedSavedPlace && (
        <DeparturePlanScreen
          place={{
            id: selectedSavedPlace.placeId,
            name: selectedSavedPlace.placeName,
            image: selectedSavedPlace.placeImage || "",
            phrase:
              selectedSavedPlace.placePhrase ||
              "다음에 가볍게 만나보려고 남겨둔 곳",
          }}
          onNavigationStart={(route) =>
            startNavigation(
              {
                id: selectedSavedPlace.placeId,
                name: selectedSavedPlace.placeName,
                image: selectedSavedPlace.placeImage || "",
                phrase:
                  selectedSavedPlace.placePhrase ||
                  "다음에 가볍게 만나보려고 남겨둔 곳",
              },
              route,
              selectedSavedPlace.journeyId,
            )
          }
          onClose={() => setSelectedSavedPlace(null)}
        />
      )}
    </>
  );
}

function getShortRegionName(name: string) {
  return name
    .replace("특별자치도", "")
    .replace("특별자치시", "")
    .replace("특별시", "")
    .replace("광역시", "")
    .replace(/도$/, "");
}
