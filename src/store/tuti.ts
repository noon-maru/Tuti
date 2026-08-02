import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getKoreanDateKey } from "@/lib/date/koreanDate";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import type { IntakeAnswers, UserLocation } from "@/shared/tuti/types";

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

type TutiState = {
  answers: IntakeAnswers;
  entryRecord?: EntryRecord;
  userLocation?: UserLocation;
  activeIndex: number;
  activePlaceId?: string;
  activeJournalEntryId?: string;
  detailOverlay: DetailOverlayState;
  entryStage: EntryStage;
  hasHydrated: boolean;
  hasSeenCardHelp: boolean;
  hasSeenSwipeHelp: boolean;
  hasSeenJournalHelp: boolean;
  dailyCheckInRequested: boolean;
  setAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key],
  ) => void;
  setUserLocation: (location: UserLocation) => void;
  clearUserLocation: () => void;
  setActivePlace: (index: number, placeId: string) => void;
  setActiveJournalEntry: (entryId?: string) => void;
  openDetail: (placeId: string) => void;
  beginDetailClose: () => void;
  finishDetailClose: () => void;
  markCardHelpSeen: () => void;
  markSwipeHelpSeen: () => void;
  markJournalHelpSeen: () => void;
  finishIntake: (status: "answered" | "skipped") => void;
  requestDailyCheckIn: () => void;
  cancelDailyCheckIn: () => void;
  completeDailyCheckIn: (
    status: EntryStatus,
    answers?: IntakeAnswers,
  ) => void;
  finishEntry: () => void;
  markHydrated: () => void;
  resetIntake: () => void;
};

export const useTutiStore = create<TutiState>()(
  persist(
    (set) => ({
      answers: {},
      entryRecord: undefined,
      userLocation: undefined,
      activeIndex: 0,
      activePlaceId: undefined,
      activeJournalEntryId: undefined,
      detailOverlay: { phase: "closed" },
      entryStage: "intake",
      hasHydrated: false,
      hasSeenCardHelp: false,
      hasSeenSwipeHelp: false,
      hasSeenJournalHelp: false,
      dailyCheckInRequested: false,
      setAnswer: (key, value) =>
        set((state) => ({
          answers: {
            ...state.answers,
            [key]: value,
          },
        })),
      setUserLocation: (userLocation) => set({ userLocation }),
      clearUserLocation: () => set({ userLocation: undefined }),
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
        }),
      markSwipeHelpSeen: () => set({ hasSeenSwipeHelp: true }),
      markJournalHelpSeen: () => set({ hasSeenJournalHelp: true }),
      finishIntake: (status) =>
        set((state) => ({
          answers: status === "skipped" ? {} : state.answers,
          entryRecord: {
            status,
            effectiveDate: getKoreanDateKey(),
            completedAt: new Date().toISOString(),
          },
          entryStage: "recommendation-ready",
        })),
      requestDailyCheckIn: () => set({ dailyCheckInRequested: true }),
      cancelDailyCheckIn: () => set({ dailyCheckInRequested: false }),
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
        })),
      finishEntry: () => set({ entryStage: "complete" }),
      markHydrated: () => set({ hasHydrated: true }),
      resetIntake: () =>
        set({
          answers: {},
          entryRecord: undefined,
          activeIndex: 0,
          activePlaceId: undefined,
          activeJournalEntryId: undefined,
          detailOverlay: { phase: "closed" },
          entryStage: "intake",
          dailyCheckInRequested: false,
        }),
    }),
    {
      name: "tuti-ui",
      storage: createJSONStorage(() => preferencesStorage),
      skipHydration: true,
      partialize: (state) => ({
        answers: state.answers,
        entryRecord: state.entryRecord,
        activePlaceId: state.activePlaceId,
        activeJournalEntryId: state.activeJournalEntryId,
        detailOverlay:
          state.detailOverlay.phase === "open"
            ? state.detailOverlay
            : { phase: "closed" as const },
        hasSeenCardHelp: state.hasSeenCardHelp,
        hasSeenSwipeHelp: state.hasSeenSwipeHelp,
        hasSeenJournalHelp: state.hasSeenJournalHelp,
      }),
    },
  ),
);
