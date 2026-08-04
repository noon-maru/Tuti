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
};

export type PlaceDetailResponse = {
  place: PlaceDetailSummary;
  detail: TourismPlaceDetail | null;
};
