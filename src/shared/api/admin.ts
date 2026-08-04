import type {
  LogLevel,
  PlaceReviewStatus,
  ReportReason,
  ReportStatus,
  UserRole,
  InquiryCategory,
  InquiryStatus,
} from "@/generated/prisma/client";

export type AdminOverview = {
  users: number;
  admins: number;
  activePlaces: number;
  pendingPlaces: number;
  pendingReports: number;
  pendingInquiries: number;
  logsToday: number;
};

export type AdminLogItem = {
  id: string;
  level: LogLevel;
  category: string;
  action: string;
  message: string;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
};

export type AdminPlaceItem = {
  id: string;
  name: string;
  source: string;
  sourceId: string | null;
  sourceContentType: string | null;
  sourceAddress: string | null;
  sourceSidoName: string | null;
  sourceSigunguName: string | null;
  sourceCopyright: string | null;
  sourceSyncedAt: string | null;
  reviewStatus: PlaceReviewStatus;
  isActive: boolean;
  movementLevel: string;
  fatigue: number;
  updatedAt: string;
};

export type AdminPlaceFilterOption = {
  value: string;
  label: string;
  count: number;
};

export type AdminPlacesMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  all: number;
  statusCounts: {
    pending: number;
    approved: number;
    rejected: number;
  };
  visibilityCounts: {
    active: number;
    inactive: number;
  };
  filters: {
    sources: AdminPlaceFilterOption[];
    contentTypes: AdminPlaceFilterOption[];
    sidos: AdminPlaceFilterOption[];
    sigungus: AdminPlaceFilterOption[];
  };
};

export type AdminReportItem = {
  id: string;
  entryId: string | null;
  targetOwnerId: string;
  targetTitle: string;
  targetPublicId: string | null;
  reporterUserId: string;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  reviewerUserId: string | null;
  resolutionNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type AdminUserItem = {
  id: string;
  role: UserRole;
  email: string | null;
  providers: string[];
  journalCount: number;
  createdAt: string;
};

export type AdminInquiryItem = {
  id: string;
  requesterUserId: string | null;
  requesterEmail: string | null;
  category: InquiryCategory;
  subject: string;
  message: string;
  status: InquiryStatus;
  adminResponse: string | null;
  handledByUserId: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSettingItem = {
  key: string;
  label: string;
  description: string;
  type: "boolean" | "text";
  value: string;
  updatedAt: string | null;
};

export type AdminOverviewResponse = {
  overview: AdminOverview;
};

export type AdminRecommendationFunnelStage = {
  action: string;
  label: string;
  journeys: number;
  rateFromRuns: number;
  rateFromPrevious: number;
};

export type AdminRecommendationFunnelPlace = {
  placeId: string;
  placeName: string;
  navigationStarted: number;
  journalCreated: number;
};

export type AdminRecommendationAlgorithm = {
  version: string;
  runs: number;
};

export type AdminRecommendationFunnelResponse = {
  periodDays: number;
  generatedAt: string;
  recommendationRuns: number;
  locationUsageRate: number;
  stages: AdminRecommendationFunnelStage[];
  topPlaces: AdminRecommendationFunnelPlace[];
  algorithms: AdminRecommendationAlgorithm[];
};

export type AdminLogsResponse = {
  logs: AdminLogItem[];
};

export type AdminPlacesResponse = {
  places: AdminPlaceItem[];
  meta: AdminPlacesMeta;
};

export type AdminReportsResponse = {
  reports: AdminReportItem[];
};

export type AdminUsersResponse = {
  users: AdminUserItem[];
};

export type AdminInquiriesResponse = {
  inquiries: AdminInquiryItem[];
};

export type AdminSettingsResponse = {
  settings: AdminSettingItem[];
};
