"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTutiRecommendations } from "@/features/tuti/hooks/useTutiRecommendations";
import { useSession } from "@/features/tuti/hooks/useSession";
import { useLocationAccess } from "@/features/tuti/location/LocationAccessProvider";
import { DailyCheckInScreen } from "@/features/tuti/screens/intake/DailyCheckInScreen";
import { RecommendationsScreen } from "@/features/tuti/screens/recommendations/RecommendationsScreen";
import { logoutAccount } from "@/lib/auth/session";
import {
  getKoreanDateKey,
  isKoreanDateBefore,
  isCurrentKoreanDate,
} from "@/lib/date/koreanDate";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";
import { useTutiStore } from "@/store/tuti";

export function RecommendationsFlow({ interactive }: { interactive: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { requestLocation } = useLocationAccess();
  const session = useSession();
  const automaticLocationRequest = useRef(false);
  const [currentDate, setCurrentDate] = useState(getKoreanDateKey);
  const storedAnswers = useTutiStore((state) => state.answers);
  const userLocation = useTutiStore((state) => state.userLocation);
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
  const requestDailyCheckIn = useTutiStore(
    (state) => state.requestDailyCheckIn,
  );
  const cancelDailyCheckIn = useTutiStore(
    (state) => state.cancelDailyCheckIn,
  );
  const completeDailyCheckIn = useTutiStore(
    (state) => state.completeDailyCheckIn,
  );
  const snoozeDailyCheckIn = useTutiStore(
    (state) => state.snoozeDailyCheckIn,
  );
  const dailyRecordCurrent = isCurrentKoreanDate(entryRecord, currentDate);
  const dailyCheckInSnoozed = isKoreanDateBefore(
    currentDate,
    dailyCheckInSnoozedUntil,
  );
  const dailyCheckInVisible =
    interactive &&
    (dailyCheckInRequested || (!dailyRecordCurrent && !dailyCheckInSnoozed));
  const { places, isFetched, isPending } = useTutiRecommendations({
    enabled: dailyRecordCurrent || dailyCheckInSnoozed,
  });
  const activeIndex = useTutiStore((state) => state.activeIndex);
  const activePlaceId = useTutiStore((state) => state.activePlaceId);
  const detailOverlay = useTutiStore((state) => state.detailOverlay);
  const hasSeenCardHelp = useTutiStore((state) => state.hasSeenCardHelp);
  const hasSeenSwipeHelp = useTutiStore((state) => state.hasSeenSwipeHelp);
  const hasSeenJournalHelp = useTutiStore((state) => state.hasSeenJournalHelp);
  const setActivePlace = useTutiStore((state) => state.setActivePlace);
  const openDetailOverlay = useTutiStore((state) => state.openDetail);
  const beginDetailClose = useTutiStore((state) => state.beginDetailClose);
  const finishDetailClose = useTutiStore((state) => state.finishDetailClose);
  const markCardHelpSeen = useTutiStore((state) => state.markCardHelpSeen);
  const markSwipeHelpSeen = useTutiStore((state) => state.markSwipeHelpSeen);
  const markJournalHelpSeen = useTutiStore((state) => state.markJournalHelpSeen);

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

  useEffect(() => {
    const refreshCurrentDate = () => setCurrentDate(getKoreanDateKey());
    const interval = window.setInterval(refreshCurrentDate, 60_000);

    window.addEventListener("focus", refreshCurrentDate);
    document.addEventListener("visibilitychange", refreshCurrentDate);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshCurrentDate);
      document.removeEventListener("visibilitychange", refreshCurrentDate);
    };
  }, []);

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
    if (!isFetched) {
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
    isFetched,
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
  };

  const selectCard = (index: number) => {
    const place = places[index];

    if (!place) {
      return;
    }

    setActivePlace(index, place.id);
  };

  const openDetail = () => {
    if (!activePlace || detailOverlay.phase !== "closed") {
      return;
    }

    openDetailOverlay(activePlace.id);
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
        onRestartIntake={requestDailyCheckIn}
        onLogout={async () => {
          await logoutAccount();
          queryClient.setQueryData(["journal-entries"], []);
        }}
        accountConnected={Boolean(session?.account)}
        adminAccess={session?.account?.role === "admin"}
        locationAvailable={Boolean(userLocation)}
        locationPermissionStatus={locationPermissionStatus}
        interactive={interactive && !dailyCheckInVisible}
        initialHelp={
          interactive && detailOverlay.phase === "closed"
            ? !hasSeenCardHelp
              ? "cards"
              : !hasSeenSwipeHelp
                ? "detail"
                : !hasSeenJournalHelp
                  ? "journal"
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

          markJournalHelpSeen();
        }}
      />
      {dailyCheckInVisible && (
        <DailyCheckInScreen
          previousAnswers={storedAnswers}
          initialMode={dailyCheckInRequested ? "questions" : "summary"}
          dismissible={dailyCheckInRequested || dailyRecordCurrent}
          onReuse={() => completeDailyCheckIn("reused")}
          onSkip={() => completeDailyCheckIn("skipped")}
          onSnooze={snoozeDailyCheckIn}
          onSubmit={(answers) => completeDailyCheckIn("answered", answers)}
          onDismiss={cancelDailyCheckIn}
        />
      )}
    </>
  );
}
