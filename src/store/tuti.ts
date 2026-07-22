import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { IntakeAnswers, UserLocation } from "@/shared/tuti/types";

type TutiState = {
  answers: IntakeAnswers;
  userLocation?: UserLocation;
  activeIndex: number;
  intakeCompleted: boolean;
  hasSeenSwipeHelp: boolean;
  hasSeenJournalHelp: boolean;
  setAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key],
  ) => void;
  setUserLocation: (location: UserLocation) => void;
  clearUserLocation: () => void;
  setActiveIndex: (index: number) => void;
  moveActiveIndex: (direction: number, itemCount: number) => void;
  markSwipeHelpSeen: () => void;
  markJournalHelpSeen: () => void;
  completeIntake: () => void;
  resetAnswers: () => void;
};

export const useTutiStore = create<TutiState>()(
  persist(
    (set) => ({
      answers: {},
      userLocation: undefined,
      activeIndex: 0,
      intakeCompleted: false,
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
      setActiveIndex: (index) => set({ activeIndex: index }),
      moveActiveIndex: (direction, itemCount) =>
        set((state) => ({
          activeIndex: itemCount
            ? (state.activeIndex + direction + itemCount) % itemCount
            : state.activeIndex,
        })),
      markSwipeHelpSeen: () => set({ hasSeenSwipeHelp: true }),
      markJournalHelpSeen: () => set({ hasSeenJournalHelp: true }),
      completeIntake: () => set({ intakeCompleted: true }),
      resetAnswers: () =>
        set({ answers: {}, activeIndex: 0, intakeCompleted: false }),
    }),
    {
      name: "tuti-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        hasSeenSwipeHelp: state.hasSeenSwipeHelp,
        hasSeenJournalHelp: state.hasSeenJournalHelp,
      }),
    },
  ),
);
