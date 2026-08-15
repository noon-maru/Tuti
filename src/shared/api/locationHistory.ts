import type {
  LocationAcquisitionSource,
  LocationConsentStatus,
  LocationUsageKind,
  LocationUsageService,
} from "@/generated/prisma/client";

export type LocationConsentHistoryItem = {
  id: string;
  status: LocationConsentStatus;
  termsVersion: string;
  ageConfirmed: boolean;
  clientPlatform: string;
  createdAt: string;
};

export type LocationUsageHistoryItem = {
  id: string;
  acquisitionSource: LocationAcquisitionSource;
  service: LocationUsageService;
  kind: LocationUsageKind;
  method: string;
  externalRecipient: string | null;
  externalPurpose: string | null;
  externalMode: string | null;
  occurredAt: string;
  retentionUntil: string;
};

export type LocationHistoryResponse = {
  consentEvents: LocationConsentHistoryItem[];
  usageLogs: LocationUsageHistoryItem[];
  usageLogTotal: number;
  notice: string;
};
