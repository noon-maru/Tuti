import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import type { IntakeAnswers, UserLocation } from "@/shared/tuti/types";

type EntryStage = "intake" | "recommendation-ready" | "complete";
type EntryStatus = "answered" | "skipped";
export type DetailOverlayPhase = "closed" | "open" | "closing";

export type EntryRecord = {
  status: EntryStatus;
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
  detailOverlay: DetailOverlayState;
  entryStage: EntryStage;
  hasHydrated: boolean;
  hasSeenSwipeHelp: boolean;
  hasSeenJournalHelp: boolean;
  setAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key],
  ) => void;
  setUserLocation: (location: UserLocation) => void;
  clearUserLocation: () => void;
  setActivePlace: (index: number, placeId: string) => void;
  openDetail: (placeId: string) => void;
  beginDetailClose: () => void;
  finishDetailClose: () => void;
  markSwipeHelpSeen: () => void;
  markJournalHelpSeen: () => void;
  finishIntake: (status: EntryStatus) => void;
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
      detailOverlay: { phase: "closed" },
      entryStage: "intake",
      hasHydrated: false,
      hasSeenSwipeHelp: false,
      hasSeenJournalHelp: false,
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
      markSwipeHelpSeen: () => set({ hasSeenSwipeHelp: true }),
      markJournalHelpSeen: () => set({ hasSeenJournalHelp: true }),
      finishIntake: (status) =>
        set((state) => ({
          answers: status === "skipped" ? {} : state.answers,
          entryRecord: {
            status,
            completedAt: new Date().toISOString(),
          },
          entryStage: "recommendation-ready",
        })),
      finishEntry: () => set({ entryStage: "complete" }),
      markHydrated: () => set({ hasHydrated: true }),
      resetIntake: () =>
        set({
          answers: {},
          entryRecord: undefined,
          activeIndex: 0,
          activePlaceId: undefined,
          detailOverlay: { phase: "closed" },
          entryStage: "intake",
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
        detailOverlay:
          state.detailOverlay.phase === "open"
            ? state.detailOverlay
            : { phase: "closed" as const },
        hasSeenSwipeHelp: state.hasSeenSwipeHelp,
        hasSeenJournalHelp: state.hasSeenJournalHelp,
      }),
    },
  ),
);
