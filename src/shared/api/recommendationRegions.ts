export type RecommendationDistrictOption = {
  code?: string;
  name: string;
  candidateCount: number;
};

export type RecommendationRegionOption = {
  areaCode: string;
  name: string;
  shortName: string;
  districts: RecommendationDistrictOption[];
};

export type RecommendationRegionsResponse = {
  regions: RecommendationRegionOption[];
};
