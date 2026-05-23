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
  setAnswer: <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key],
  ) => void;
  resetAnswers: () => void;
};

export const useTutiStore = create<TutiState>((set) => ({
  answers: {},
  setAnswer: (key, value) =>
    set((state) => ({
      answers: {
        ...state.answers,
        [key]: value,
      },
    })),
  resetAnswers: () => set({ answers: {} }),
}));
