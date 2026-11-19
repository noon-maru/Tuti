/** Serialized recommendation fields shared by web, native clients and the server. */
export type DogScore = {
  access: number;
  facility: number;
  purpose: number;
  distance: number;
  time: number;
  weather: number;
  novelty: number;
  total: number;
};

export type DogRecommendationAudit = {
  algorithmVersion: string;
  catalogReady: number;
  areaCandidates: number;
  distanceEligible: number;
  destinationEligible: number;
  companionEligible: number;
  timeEligible: number;
  purposeEligible: number;
  budgetEligible: number;
  returned: number;
  conditionsProvided: boolean;
};
