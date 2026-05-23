import { create } from "zustand";

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
  setAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key],
  ) => void;
  setActiveIndex: (index: number) => void;
  moveActiveIndex: (direction: number, itemCount: number) => void;
  resetAnswers: () => void;
};

export const useTutiStore = create<TutiState>((set) => ({
  answers: {},
  activeIndex: 0,
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
  resetAnswers: () => set({ answers: {}, activeIndex: 0 }),
}));
