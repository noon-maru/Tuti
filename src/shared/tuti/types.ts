export type MovementAnswer = "near" | "short" | "half";
export type AirAnswer = "quiet" | "open" | "walk";
export type DensityAnswer = "quiet" | "balanced" | "lively";

export type IntakeAnswers = {
  movement?: MovementAnswer;
  air?: AirAnswer;
  density?: DensityAnswer;
};

export type UserLocation = {
  latitude: number;
  longitude: number;
};
