export type TourismPlaceDetailImage = {
  url: string;
  thumbnailUrl: string | null;
  title: string | null;
  copyrightCode: string | null;
  serialNumber: string | null;
};

export type TourismPlaceDetailSection = {
  title: string;
  content: string;
};

export type TourismPlaceDetail = {
  contentId: string;
  contentTypeId: string | null;
  overview: string | null;
  overviewSummary: string | null;
  homepage: string | null;
  phone: string | null;
  openingHours: string | null;
  restDate: string | null;
  admissionFee: string | null;
  parking: string | null;
  reservation: string | null;
  usageDuration: string | null;
  experienceGuide: string | null;
  sections: TourismPlaceDetailSection[];
  images: TourismPlaceDetailImage[];
  syncedAt: string;
  isStale: boolean;
};

export type PlaceDetailSummary = {
  id: string;
  name: string;
  address: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
  /** 원문에서 검토해 별도 저장한 행동 문구. 일반적인 출발 단계 fallback과 구분한다. */
  suggestedAction?: string | null;
};

export type PlaceSuggestedStep = {
  kind: "route" | "arrival" | "nearby";
  title: string;
  description: string | null;
};

export type PlaceDetailResponse = {
  place: PlaceDetailSummary;
  detail: TourismPlaceDetail | null;
  suggestedPlan: PlaceSuggestedStep[];
};
