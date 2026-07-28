export type TourismDataTab =
  | "places"
  | "wellness"
  | "municipalCore"
  | "concentration"
  | "visitors"
  | "metrics"
  | "runs";

export type TourismDataOverview = {
  placeSourceRecords: number;
  wellnessSourceRecords: number;
  municipalCoreSourceRecords: number;
  touristSpotConcentrationRecords: number;
  regionalVisitorCountRecords: number;
  regionalMetrics: number;
  syncRuns: number;
  failedRuns: number;
  lastSyncedAt: string | null;
  connections: Array<{
    source: string;
    label: string;
    configured: boolean;
  }>;
};

export type TourismPlaceSourceItem = {
  contentId: string;
  contentTypeId: string | null;
  title: string;
  areaCode: string | null;
  sigunguCode: string | null;
  linkedPlaceId: string | null;
  sourceModifiedAt: string | null;
  syncedAt: string;
  rawPayload: unknown;
};

export type TourismRegionMetricItem = {
  id: string;
  dataset: string;
  metricType: string;
  metricCode: string;
  metricName: string;
  metricValue: string | null;
  baseYm: string;
  areaCode: string;
  areaName: string;
  sigunguCode: string;
  sigunguName: string;
  syncedAt: string;
  rawPayload: unknown;
};

export type WellnessTourismSourceItem = {
  id: string;
  contentId: string;
  contentTypeId: string | null;
  langDivCd: string;
  title: string;
  wellnessThemeCode: string | null;
  areaCode: string | null;
  sigunguCode: string | null;
  sourceModifiedAt: string | null;
  syncedAt: string;
  rawPayload: unknown;
};

export type MunicipalCoreTourismSourceItem = {
  id: string;
  baseYm: string;
  areaCode: string;
  areaName: string;
  sigunguCode: string;
  sigunguName: string;
  touristSpotCode: string;
  touristSpotName: string;
  rank: number;
  categoryLargeName: string | null;
  categoryMediumName: string | null;
  longitude: string | null;
  latitude: string | null;
  syncedAt: string;
  rawPayload: unknown;
};

export type TouristSpotConcentrationRateItem = {
  id: string;
  baseYmd: string;
  areaCode: string;
  areaName: string;
  sigunguCode: string;
  sigunguName: string;
  touristSpotName: string;
  concentrationRate: string;
  syncedAt: string;
  rawPayload: unknown;
};

export type RegionalVisitorCountItem = {
  id: string;
  aggregationLevel: string;
  baseYmd: string;
  regionCode: string;
  regionName: string;
  weekdayCode: string;
  weekdayName: string;
  visitorTypeCode: string;
  visitorTypeName: string;
  visitorCount: string;
  syncedAt: string;
  rawPayload: unknown;
};

export type ExternalDataSyncRunItem = {
  id: string;
  source: string;
  operation: string;
  status: string;
  parameters: unknown;
  receivedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type TourismDataResponse = {
  overview: TourismDataOverview;
  places: TourismPlaceSourceItem[];
  wellness: WellnessTourismSourceItem[];
  municipalCore: MunicipalCoreTourismSourceItem[];
  concentration: TouristSpotConcentrationRateItem[];
  visitors: RegionalVisitorCountItem[];
  metrics: TourismRegionMetricItem[];
  runs: ExternalDataSyncRunItem[];
};

export type TourismDataSyncResponse = {
  result: {
    syncRunId: string;
    received: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
};
