import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type MovementAnswer = "near" | "short" | "half";
export type AirAnswer = "quiet" | "water" | "walk";
export type AloneAnswer = "alone" | "some";

export type IntakeAnswers = {
  movement?: MovementAnswer;
  air?: AirAnswer;
  alone?: AloneAnswer;
};

type TutiState = {
  answers: IntakeAnswers;
  activeIndex: number;
  hasSeenSwipeHelp: boolean;
  hasSeenJournalHelp: boolean;
  setAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key],
  ) => void;
  setActiveIndex: (index: number) => void;
  moveActiveIndex: (direction: number, itemCount: number) => void;
  markSwipeHelpSeen: () => void;
  markJournalHelpSeen: () => void;
  resetAnswers: () => void;
};

export const useTutiStore = create<TutiState>()(
  persist(
    (set) => ({
      answers: {},
      activeIndex: 0,
      hasSeenSwipeHelp: false,
      hasSeenJournalHelp: false,
      setAnswer: (key, value) =>
        set((state) => ({
          answers: {
            ...state.answers,
            [key]: value,
          },
        })),
      setActiveIndex: (index) => set({ activeIndex: index }),
      moveActiveIndex: (direction, itemCount) =>
        set((state) => ({
          activeIndex: itemCount
            ? (state.activeIndex + direction + itemCount) % itemCount
            : state.activeIndex,
        })),
      markSwipeHelpSeen: () => set({ hasSeenSwipeHelp: true }),
      markJournalHelpSeen: () => set({ hasSeenJournalHelp: true }),
      resetAnswers: () => set({ answers: {}, activeIndex: 0 }),
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
