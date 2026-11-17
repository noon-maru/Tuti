import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  getKoreanDateKey,
  getKoreanDateKeyAfterDays,
} from "@/lib/date/koreanDate";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { withDefaultIntakeAnswers } from "@/lib/intakePreferences";
import type { TutiPlace } from "@/lib/recommendations";
import type { DogOuting } from "@/shared/pets/dogAccess";
import { hasMovedRecommendationOrigin } from "@/features/tuti/recommendationSnapshot";
import type { DepartureRouteMode } from "@/shared/api/departurePlan";
import { getLocationTermsVersion } from "@/shared/location/terms";
import {
  type IntakeAnswers,
  type LocationConsentRecord,
  type LocationPermissionStatus,
  type PreferredRegion,
  type UserLocation,
} from "@/shared/tuti/types";

type EntryStage = "intake" | "recommendation-ready" | "complete";
type EntryStatus = "answered" | "reused" | "skipped";
export type DetailOverlayPhase = "closed" | "open" | "closing";

export type EntryRecord = {
  status: EntryStatus;
  effectiveDate?: string;
  completedAt: string;
};

export type DetailOverlayState = {
  phase: DetailOverlayPhase;
  placeId?: string;
};

export type PendingDeparture = {
  returnConfirmed?: boolean;
  ownerId?: string;
  harumadiId?: string;
  journeyId: string;
  placeId: string;
  placeName: string;
  placeImage: string;
  placePhrase: string;
  routeMode: DepartureRouteMode;
  startedAt: string;
  promptAfter: string;
};

export type SavedDeparturePlace = {
  ownerId?: string;
  harumadiId?: string;
  journeyId: string;
  placeId: string;
  placeName: string;
  placeImage: string;
  placePhrase: string;
  savedAt: string;
};

export type SavedDeparturePlaceInput = Omit<SavedDeparturePlace, "savedAt">;

export type DailyRecommendationSnapshot = {
  snapshotVersion?: 1;
  ownerId?: string;
  locationAnchor?: UserLocation;
  regionKey?: string;
  effectiveDate: string;
  cycle: number;
  recommendationId: string;
  algorithmVersion: string;
  inputFingerprint: string;
  places: TutiPlace[];
};

export type CardDisplayPreferences = {
  showPlaceName: boolean;
  showPublicTransitTime: boolean;
};

type TutiState = {
  recommendationDogOuting?: { ownerId: string; value: DogOuting };
  setRecommendationDogOuting: (ownerId: string, value?: DogOuting) => void;
  answers: IntakeAnswers;
  entryRecord?: EntryRecord;
  userLocation?: UserLocation;
  recommendationLocationSource?: "device" | "region";
  locationConsent?: LocationConsentRecord;
  locationPermissionStatus: LocationPermissionStatus;
  preferredRegion?: PreferredRegion;
  dailyRecommendation?: DailyRecommendationSnapshot;
  recommendationCycle: number;
  recommendationExcludedPlaceIds: string[];
  activeIndex: number;
  activePlaceId?: string;
  activeJournalEntryId?: string;
  detailOverlay: DetailOverlayState;
  entryStage: EntryStage;
  hasHydrated: boolean;
  hasSeenCardHelp: boolean;
  hasSeenSwipeHelp: boolean;
  hasSeenJournalHelp: boolean;
  hasSeenDepartureHelp: boolean;
  dailyCheckInRequested: boolean;
  dailyCheckInSnoozedUntil?: string;
  pendingDeparture?: PendingDeparture;
  savedDeparturePlaces: SavedDeparturePlace[];
  cardDisplayPreferences: CardDisplayPreferences;
  setAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key],
  ) => void;
  setUserLocation: (location: UserLocation) => void;
  clearUserLocation: (source?: "region") => void;
  acceptLocationConsent: () => void;
  syncLocationConsent: (consent?: LocationConsentRecord) => void;
  pauseLocationConsent: () => void;
  declineLocationConsent: () => void;
  withdrawLocationConsent: () => void;
  setLocationPermissionStatus: (status: LocationPermissionStatus) => void;
  setPreferredRegion: (region?: PreferredRegion) => void;
  cacheDailyRecommendation: (
    recommendationId: string,
    algorithmVersion: string,
    places: TutiPlace[],
    inputFingerprint: string,
    context?: Pick<DailyRecommendationSnapshot, "ownerId" | "locationAnchor" | "regionKey">,
  ) => void;
  refreshDailyRecommendation: () => void;
  setActivePlace: (index: number, placeId: string) => void;
  setActiveJournalEntry: (entryId?: string) => void;
  openDetail: (placeId: string) => void;
  beginDetailClose: () => void;
  finishDetailClose: () => void;
  markCardHelpSeen: () => void;
  markSwipeHelpSeen: () => void;
  markJournalHelpSeen: () => void;
  markDepartureHelpSeen: () => void;
  skipInitialHelp: () => void;
  replayInitialHelp: () => void;
  finishIntake: (status: "answered" | "skipped") => void;
  requestDailyCheckIn: () => void;
  cancelDailyCheckIn: () => void;
  snoozeDailyCheckIn: () => void;
  completeDailyCheckIn: (
    status: EntryStatus,
    answers?: IntakeAnswers,
  ) => void;
  setPendingDeparture: (departure: PendingDeparture) => void;
  postponePendingDeparture: () => void;
  completePendingDeparture: () => void;
  confirmPendingDepartureReturn: () => void;
  deferPendingDeparture: () => void;
  addSavedDeparturePlace: (place: SavedDeparturePlaceInput) => void;
  removeSavedDeparturePlace: (placeId: string) => void;
  setCardDisplayPreferences: (
    preferences: CardDisplayPreferences,
  ) => void;
  finishEntry: () => void;
  markHydrated: () => void;
  resetIntake: () => void;
  resetAllData: () => void;
};

export const useTutiStore = create<TutiState>()(
  persist(
    (set) => ({
      recommendationDogOuting: undefined,
      setRecommendationDogOuting: (ownerId, value) => set({ recommendationDogOuting: value ? { ownerId, value } : undefined }),
      answers: withDefaultIntakeAnswers(),
      entryRecord: undefined,
      userLocation: undefined,
      recommendationLocationSource: undefined,
      locationConsent: undefined,
      locationPermissionStatus: "unknown",
      preferredRegion: undefined,
      dailyRecommendation: undefined,
      recommendationCycle: 0,
      recommendationExcludedPlaceIds: [],
      activeIndex: 0,
      activePlaceId: undefined,
      activeJournalEntryId: undefined,
      detailOverlay: { phase: "closed" },
      entryStage: "intake",
      hasHydrated: false,
      hasSeenCardHelp: false,
      hasSeenSwipeHelp: false,
      hasSeenJournalHelp: false,
      hasSeenDepartureHelp: false,
      dailyCheckInRequested: false,
      dailyCheckInSnoozedUntil: undefined,
      pendingDeparture: undefined,
      savedDeparturePlaces: [],
      cardDisplayPreferences: {
        showPlaceName: true,
        showPublicTransitTime: true,
      },
      setAnswer: (key, value) =>
        set((state) => ({
          answers: withDefaultIntakeAnswers({
            ...state.answers,
            [key]: value,
            ...(key === "petCompanion" && value !== "dog" ? { placeCategories: undefined } : {}),
            ...(key === "movement" && value !== "far"
              ? { longDistanceTiming: undefined }
              : {}),
          }),
        })),
      setUserLocation: (userLocation) => set(state => ({
        userLocation, recommendationLocationSource: "device",
        ...(state.dailyRecommendation?.locationAnchor && hasMovedRecommendationOrigin(state.dailyRecommendation.locationAnchor, userLocation) ? {
          dailyRecommendation: undefined,
          recommendationCycle: state.recommendationCycle + 1,
          recommendationExcludedPlaceIds: [],
          activeIndex: 0,
          activePlaceId: undefined,
          detailOverlay: { phase: "closed" as const },
        } : {}),
      })),
      clearUserLocation: (source) => set((state) => ({
        recommendationCycle: state.recommendationCycle + 1,
        recommendationLocationSource: source ?? state.recommendationLocationSource,
        userLocation: undefined,
        dailyRecommendation: undefined,
        recommendationExcludedPlaceIds: [],
        activeIndex: 0,
        activePlaceId: undefined,
        detailOverlay: { phase: "closed" },
        pendingDeparture: undefined,
      })),
      acceptLocationConsent: () =>
        set({
          locationConsent: {
            status: "accepted",
            termsVersion: getLocationTermsVersion(),
            updatedAt: new Date().toISOString(),
          },
        }),
      syncLocationConsent: (locationConsent) =>
        set((state) => {
          // 위치 미제공 사용자의 지역 추천은 동의 상태 재조회로 초기화하지 않는다.
          const regionSnapshot = state.recommendationLocationSource !== "device" &&
            state.dailyRecommendation?.snapshotVersion === 1 && !state.dailyRecommendation.locationAnchor;
          return locationConsent?.status === "accepted" &&
          (state.locationConsent?.status !== "accepted" || state.locationConsent.updatedAt === locationConsent.updatedAt)
            ? { locationConsent }
            : {
                recommendationCycle: regionSnapshot ? state.recommendationCycle : state.recommendationCycle + (state.userLocation || state.dailyRecommendation ? 1 : 0),
                userLocation: undefined,
                locationPermissionStatus: "unknown",
                dailyRecommendation: undefined,
                recommendationExcludedPlaceIds: [],
                activeIndex: 0,
                activePlaceId: undefined,
                detailOverlay: { phase: "closed" },
                pendingDeparture: undefined,
                ...(regionSnapshot ? {
                  dailyRecommendation: state.dailyRecommendation,
                  activeIndex: state.activeIndex,
                  activePlaceId: state.activePlaceId,
                  detailOverlay: state.detailOverlay,
                } : {}),
                locationConsent,
              };
        }),
      pauseLocationConsent: () =>
        set((state) => ({
          recommendationCycle: state.recommendationCycle + 1,
          userLocation: undefined,
          locationPermissionStatus: "unknown",
          dailyRecommendation: undefined,
          recommendationExcludedPlaceIds: [],
          activeIndex: 0,
          activePlaceId: undefined,
          detailOverlay: { phase: "closed" },
          pendingDeparture: undefined,
          locationConsent: {
            status: "paused",
            termsVersion: getLocationTermsVersion(),
            updatedAt: new Date().toISOString(),
          },
        })),
      declineLocationConsent: () =>
        set((state) => ({
          recommendationCycle: state.recommendationCycle + 1,
          userLocation: undefined,
          dailyRecommendation: undefined,
          locationConsent: {
            status: "declined",
            termsVersion: getLocationTermsVersion(),
            updatedAt: new Date().toISOString(),
          },
        })),
      withdrawLocationConsent: () =>
        set((state) => ({
          recommendationCycle: state.recommendationCycle + 1,
          userLocation: undefined,
          locationPermissionStatus: "unknown",
          dailyRecommendation: undefined,
          recommendationExcludedPlaceIds: [],
          activeIndex: 0,
          activePlaceId: undefined,
          detailOverlay: { phase: "closed" },
          pendingDeparture: undefined,
          locationConsent: {
            status: "withdrawn",
            termsVersion: getLocationTermsVersion(),
            updatedAt: new Date().toISOString(),
          },
        })),
      setLocationPermissionStatus: (locationPermissionStatus) =>
        set({ locationPermissionStatus }),
      setPreferredRegion: (preferredRegion) => set(preferredRegion ? {
        preferredRegion,
        recommendationLocationSource: "region",
        userLocation: undefined,
        dailyRecommendation: undefined,
        recommendationExcludedPlaceIds: [],
        activeIndex: 0,
        activePlaceId: undefined,
        detailOverlay: { phase: "closed" },
        pendingDeparture: undefined,
      } : { preferredRegion, recommendationLocationSource: undefined }),
      cacheDailyRecommendation: (
        recommendationId,
        algorithmVersion,
        places,
        inputFingerprint,
        context,
      ) =>
        set((state) => ({
          dailyRecommendation: {
            ...(context ? { ...context, snapshotVersion: 1 as const } : {}),
            effectiveDate: getKoreanDateKey(),
            cycle: state.recommendationCycle,
            recommendationId,
            algorithmVersion,
            inputFingerprint,
            places,
          },
        })),
      refreshDailyRecommendation: () =>
        set((state) => ({
          dailyRecommendation: undefined,
          recommendationCycle: state.recommendationCycle + 1,
          recommendationExcludedPlaceIds:
            state.dailyRecommendation?.places.map((place) => place.id) ?? [],
          activeIndex: 0,
          activePlaceId: undefined,
          detailOverlay: { phase: "closed" },
        })),
      setActivePlace: (activeIndex, activePlaceId) =>
        set({ activeIndex, activePlaceId }),
      setActiveJournalEntry: (activeJournalEntryId) =>
        set({ activeJournalEntryId }),
      openDetail: (placeId) =>
        set({
          detailOverlay: {
            phase: "open",
            placeId,
          },
        }),
      beginDetailClose: () =>
        set((state) => ({
          detailOverlay:
            state.detailOverlay.phase === "open"
              ? {
                  ...state.detailOverlay,
                  phase: "closing",
                }
              : state.detailOverlay,
        })),
      finishDetailClose: () =>
        set({
          detailOverlay: { phase: "closed" },
        }),
      markCardHelpSeen: () =>
        set({
          hasSeenCardHelp: true,
          hasSeenSwipeHelp: false,
          hasSeenJournalHelp: false,
          hasSeenDepartureHelp: false,
        }),
      markSwipeHelpSeen: () => set({ hasSeenSwipeHelp: true }),
      markJournalHelpSeen: () => set({ hasSeenJournalHelp: true }),
      markDepartureHelpSeen: () => set({ hasSeenDepartureHelp: true }),
      skipInitialHelp: () =>
        set({
          hasSeenCardHelp: true,
          hasSeenSwipeHelp: true,
          hasSeenJournalHelp: true,
          hasSeenDepartureHelp: true,
        }),
      replayInitialHelp: () =>
        set({
          hasSeenCardHelp: false,
          hasSeenSwipeHelp: false,
          hasSeenJournalHelp: false,
          hasSeenDepartureHelp: false,
        }),
      finishIntake: (status) =>
        set((state) => ({
          answers:
            status === "skipped"
              ? withDefaultIntakeAnswers()
              : withDefaultIntakeAnswers(state.answers),
          entryRecord: {
            status,
            effectiveDate: getKoreanDateKey(),
            completedAt: new Date().toISOString(),
          },
          entryStage: "recommendation-ready",
          dailyCheckInSnoozedUntil: undefined,
        })),
      requestDailyCheckIn: () => set({ dailyCheckInRequested: true }),
      cancelDailyCheckIn: () => set({ dailyCheckInRequested: false }),
      snoozeDailyCheckIn: () =>
        set({
          dailyCheckInRequested: false,
          dailyCheckInSnoozedUntil: getKoreanDateKeyAfterDays(7),
        }),
      completeDailyCheckIn: (status, answers) =>
        set((state) => ({
          answers:
            status === "answered" && answers
              ? withDefaultIntakeAnswers(answers)
              : withDefaultIntakeAnswers(state.answers),
          entryRecord: {
            status,
            effectiveDate: getKoreanDateKey(),
            completedAt: new Date().toISOString(),
          },
          dailyCheckInRequested: false,
          dailyCheckInSnoozedUntil: undefined,
        })),
      setPendingDeparture: (pendingDeparture) => set({ pendingDeparture }),
      postponePendingDeparture: () =>
        set((state) => ({
          pendingDeparture: state.pendingDeparture
            ? {
                ...state.pendingDeparture,
                promptAfter: new Date(
                  Date.now() + 24 * 60 * 60 * 1_000,
                ).toISOString(),
              }
            : undefined,
        })),
      completePendingDeparture: () => set({ pendingDeparture: undefined }),
      confirmPendingDepartureReturn: () => set(state => ({
        pendingDeparture: state.pendingDeparture ? { ...state.pendingDeparture, returnConfirmed: true } : undefined,
      })),
      deferPendingDeparture: () =>
        set((state) => {
          if (!state.pendingDeparture) return state;

          const savedPlace: SavedDeparturePlace = {
            ownerId: state.pendingDeparture.ownerId,
            harumadiId: state.pendingDeparture.harumadiId,
            journeyId: state.pendingDeparture.journeyId,
            placeId: state.pendingDeparture.placeId,
            placeName: state.pendingDeparture.placeName,
            placeImage: state.pendingDeparture.placeImage,
            placePhrase: state.pendingDeparture.placePhrase,
            savedAt: new Date().toISOString(),
          };

          return {
            pendingDeparture: undefined,
            savedDeparturePlaces: prependSavedDeparturePlace(
              state.savedDeparturePlaces,
              savedPlace,
            ),
          };
        }),
      addSavedDeparturePlace: (place) =>
        set((state) => ({
          savedDeparturePlaces: prependSavedDeparturePlace(
            state.savedDeparturePlaces,
            {
              ...place,
              savedAt: new Date().toISOString(),
            },
          ),
        })),
      removeSavedDeparturePlace: (placeId) =>
        set((state) => ({
          savedDeparturePlaces: state.savedDeparturePlaces.filter(
            (place) => place.placeId !== placeId,
          ),
        })),
      setCardDisplayPreferences: (cardDisplayPreferences) =>
        set({ cardDisplayPreferences }),
      finishEntry: () => set({ entryStage: "complete" }),
      markHydrated: () => set({ hasHydrated: true }),
      resetIntake: () =>
        set((state) => ({
          recommendationDogOuting: undefined,
          answers: withDefaultIntakeAnswers(),
          entryRecord: undefined,
          dailyRecommendation: undefined,
          recommendationCycle: state.recommendationCycle + 1,
          recommendationExcludedPlaceIds: [],
          activeIndex: 0,
          activePlaceId: undefined,
          activeJournalEntryId: undefined,
          detailOverlay: { phase: "closed" },
          entryStage: "intake",
          dailyCheckInRequested: false,
          dailyCheckInSnoozedUntil: undefined,
        })),
      resetAllData: () =>
        set({
          recommendationDogOuting: undefined,
          answers: withDefaultIntakeAnswers(),
          entryRecord: undefined,
          userLocation: undefined,
          recommendationLocationSource: undefined,
          locationConsent: undefined,
          locationPermissionStatus: "unknown",
          preferredRegion: undefined,
          dailyRecommendation: undefined,
          recommendationCycle: 0,
          recommendationExcludedPlaceIds: [],
          activeIndex: 0,
          activePlaceId: undefined,
          activeJournalEntryId: undefined,
          detailOverlay: { phase: "closed" },
          entryStage: "intake",
          hasHydrated: true,
          hasSeenCardHelp: false,
          hasSeenSwipeHelp: false,
          hasSeenJournalHelp: false,
          hasSeenDepartureHelp: false,
          dailyCheckInRequested: false,
          dailyCheckInSnoozedUntil: undefined,
          pendingDeparture: undefined,
          savedDeparturePlaces: [],
          cardDisplayPreferences: {
            showPlaceName: true,
            showPublicTransitTime: true,
          },
        }),
    }),
    {
      name: "tuti-ui",
      storage: createJSONStorage(() => preferencesStorage),
      skipHydration: true,
      merge: (persistedState, currentState) => {
        const restored = persistedState && typeof persistedState === "object" && !Array.isArray(persistedState)
          ? persistedState as Partial<TutiState> : {};
        return { ...currentState, ...restored, answers: withDefaultIntakeAnswers(restored.answers ?? currentState.answers) };
      },
      partialize: (state) => ({
        recommendationDogOuting: state.recommendationDogOuting,
        answers: state.answers,
        entryRecord: state.entryRecord,
        locationConsent: state.locationConsent,
        recommendationLocationSource: state.recommendationLocationSource,
        preferredRegion: state.preferredRegion,
        dailyRecommendation: state.dailyRecommendation,
        recommendationCycle: state.recommendationCycle,
        recommendationExcludedPlaceIds:
          state.recommendationExcludedPlaceIds,
        dailyCheckInSnoozedUntil: state.dailyCheckInSnoozedUntil,
        pendingDeparture: state.pendingDeparture,
        savedDeparturePlaces: state.savedDeparturePlaces,
        cardDisplayPreferences: state.cardDisplayPreferences,
        activePlaceId: state.activePlaceId,
        activeJournalEntryId: state.activeJournalEntryId,
        detailOverlay:
          state.detailOverlay.phase === "open"
            ? state.detailOverlay
            : { phase: "closed" as const },
        hasSeenCardHelp: state.hasSeenCardHelp,
        hasSeenSwipeHelp: state.hasSeenSwipeHelp,
        hasSeenJournalHelp: state.hasSeenJournalHelp,
        hasSeenDepartureHelp: state.hasSeenDepartureHelp,
      }),
    },
  ),
);

function prependSavedDeparturePlace(
  places: SavedDeparturePlace[],
  savedPlace: SavedDeparturePlace,
) {
  return [
    savedPlace,
    ...places.filter((place) => place.placeId !== savedPlace.placeId),
  ].slice(0, 20);
}
