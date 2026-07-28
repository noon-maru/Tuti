export type TourismDataTab =
  | "places"
  | "wellness"
  | "metrics"
  | "runs";

export type TourismDataOverview = {
  placeSourceRecords: number;
  wellnessSourceRecords: number;
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
