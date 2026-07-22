export type MovementAnswer = "near" | "short" | "half";
export type AirAnswer = "quiet" | "open" | "walk";
export type AloneAnswer = "alone" | "some";

export type IntakeAnswers = {
  movement?: MovementAnswer;
  air?: AirAnswer;
  alone?: AloneAnswer;
};

export type UserLocation = {
  latitude: number;
  longitude: number;
};
