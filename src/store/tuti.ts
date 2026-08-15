import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  getKoreanDateKey,
  getKoreanDateKeyAfterDays,
} from "@/lib/date/koreanDate";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import type { TutiPlace } from "@/lib/recommendations";
import type { DepartureRouteMode } from "@/shared/api/departurePlan";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";
import type {
  IntakeAnswers,
  LocationConsentRecord,
  LocationPermissionStatus,
  PreferredRegion,
  UserLocation,
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
  journeyId: string;
  placeId: string;
  placeName: string;
  placeImage: string;
  placePhrase: string;
  savedAt: string;
};

export type DailyRecommendationSnapshot = {
  effectiveDate: string;
  cycle: number;
  recommendationId: string;
  algorithmVersion: string;
  places: TutiPlace[];
};

type TutiState = {
  answers: IntakeAnswers;
  entryRecord?: EntryRecord;
  userLocation?: UserLocation;
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
  setAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key],
  ) => void;
  setUserLocation: (location: UserLocation) => void;
  clearUserLocation: () => void;
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
  deferPendingDeparture: () => void;
  removeSavedDeparturePlace: (placeId: string) => void;
  finishEntry: () => void;
  markHydrated: () => void;
  resetIntake: () => void;
};

export const useTutiStore = create<TutiState>()(
  persist(
    (set) => ({
      answers: { movement: "short" },
      entryRecord: undefined,
      userLocation: undefined,
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
      setAnswer: (key, value) =>
        set((state) => ({
          answers: {
            ...state.answers,
            [key]: value,
            ...(key === "movement" && value !== "far"
              ? { longDistanceTiming: undefined }
              : {}),
          },
        })),
      setUserLocation: (userLocation) => set({ userLocation }),
      clearUserLocation: () => set({ userLocation: undefined }),
      acceptLocationConsent: () =>
        set({
          locationConsent: {
            status: "accepted",
            termsVersion: LOCATION_TERMS_VERSION,
            updatedAt: new Date().toISOString(),
          },
        }),
      syncLocationConsent: (locationConsent) =>
        set(
          locationConsent?.status === "accepted"
            ? { locationConsent }
            : {
                userLocation: undefined,
                locationPermissionStatus: "unknown",
                dailyRecommendation: undefined,
                recommendationExcludedPlaceIds: [],
                activeIndex: 0,
                activePlaceId: undefined,
                detailOverlay: { phase: "closed" },
                pendingDeparture: undefined,
                locationConsent,
              },
        ),
      pauseLocationConsent: () =>
        set({
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
            termsVersion: LOCATION_TERMS_VERSION,
            updatedAt: new Date().toISOString(),
          },
        }),
      declineLocationConsent: () =>
        set({
          userLocation: undefined,
          locationConsent: {
            status: "declined",
            termsVersion: LOCATION_TERMS_VERSION,
            updatedAt: new Date().toISOString(),
          },
        }),
      withdrawLocationConsent: () =>
        set({
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
            termsVersion: LOCATION_TERMS_VERSION,
            updatedAt: new Date().toISOString(),
          },
        }),
      setLocationPermissionStatus: (locationPermissionStatus) =>
        set({ locationPermissionStatus }),
      setPreferredRegion: (preferredRegion) => set({ preferredRegion }),
      cacheDailyRecommendation: (
        recommendationId,
        algorithmVersion,
        places,
      ) =>
        set((state) => ({
          dailyRecommendation: {
            effectiveDate: getKoreanDateKey(),
            cycle: state.recommendationCycle,
            recommendationId,
            algorithmVersion,
            places,
          },
          recommendationExcludedPlaceIds: [],
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
      finishIntake: (status) =>
        set((state) => ({
          answers: status === "skipped" ? {} : state.answers,
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
            status === "answered" && answers ? answers : state.answers,
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
      deferPendingDeparture: () =>
        set((state) => {
          if (!state.pendingDeparture) return state;

          const savedPlace: SavedDeparturePlace = {
            journeyId: state.pendingDeparture.journeyId,
            placeId: state.pendingDeparture.placeId,
            placeName: state.pendingDeparture.placeName,
            placeImage: state.pendingDeparture.placeImage,
            placePhrase: state.pendingDeparture.placePhrase,
            savedAt: new Date().toISOString(),
          };

          return {
            pendingDeparture: undefined,
            savedDeparturePlaces: [
              savedPlace,
              ...state.savedDeparturePlaces.filter(
                (place) => place.placeId !== savedPlace.placeId,
              ),
            ].slice(0, 20),
          };
        }),
      removeSavedDeparturePlace: (placeId) =>
        set((state) => ({
          savedDeparturePlaces: state.savedDeparturePlaces.filter(
            (place) => place.placeId !== placeId,
          ),
        })),
      finishEntry: () => set({ entryStage: "complete" }),
      markHydrated: () => set({ hasHydrated: true }),
      resetIntake: () =>
        set((state) => ({
          answers: { movement: "short" },
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
    }),
    {
      name: "tuti-ui",
      storage: createJSONStorage(() => preferencesStorage),
      skipHydration: true,
      partialize: (state) => ({
        answers: state.answers,
        entryRecord: state.entryRecord,
        locationConsent: state.locationConsent,
        preferredRegion: state.preferredRegion,
        dailyRecommendation: state.dailyRecommendation,
        recommendationCycle: state.recommendationCycle,
        recommendationExcludedPlaceIds:
          state.recommendationExcludedPlaceIds,
        dailyCheckInSnoozedUntil: state.dailyCheckInSnoozedUntil,
        pendingDeparture: state.pendingDeparture,
        savedDeparturePlaces: state.savedDeparturePlaces,
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
