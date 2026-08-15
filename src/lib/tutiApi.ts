import { apiUrl } from "@/lib/api/apiUrl";
import { fetchWithSession } from "@/lib/auth/session";
import { Capacitor } from "@capacitor/core";
import type {
  DeparturePlan,
  DeparturePlanResponse,
} from "@/shared/api/departurePlan";
import type {
  NearbyPlaceResult,
  NearbyPlacesResponse,
} from "@/shared/api/nearbyPlaces";
import type {
  DeleteJournalEntryResponse,
  JournalEntriesResponse,
  JournalEntryInput,
  JournalEntryResponse,
  JournalPublicationResponse,
  JournalShareTraceFinalization,
  JournalShareTraceFinalizationResponse,
  JournalShareTraceIssue,
  JournalShareTraceIssueResponse,
  TutiJournalEntry,
} from "@/shared/api/journal";
import type {
  PlaceDetailResponse,
} from "@/shared/api/placeDetails";
import type {
  TravelTimeResponse,
  TravelTimeSummary,
} from "@/shared/api/travelTime";
import type {
  RecommendationActionInput,
  RecommendationActionResponse,
} from "@/shared/api/recommendationActions";
import type {
  RecommendationErrorCode,
  RecommendationErrorResponse,
  RecommendationRequest,
  RecommendationResponse,
} from "@/shared/api/recommendations";
import type { NearbyAccommodationsResponse } from "@/shared/api/accommodations";
import type {
  IntakeAnswers,
  LocationConsentStatus,
  PreferredRegion,
  UserLocation,
} from "@/shared/tuti/types";
import type { LocationConsentResponse } from "@/shared/api/locationCompliance";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";

export async function updateLocationConsent(
  status: LocationConsentStatus,
  ageConfirmed = false,
) {
  const platform = Capacitor.getPlatform();
  const response = await fetchWithSession("location-consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      termsVersion: LOCATION_TERMS_VERSION,
      ageConfirmed,
      clientPlatform:
        platform === "ios" || platform === "android" ? platform : "web",
    }),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "위치정보 동의를 기록하지 못했어요."),
    );
  }
  return (await response.json()) as LocationConsentResponse;
}

export async function fetchLocationConsent() {
  const response = await fetchWithSession("location-consent");
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "위치정보 동의 상태를 확인하지 못했어요."),
    );
  }
  return ((await response.json()) as LocationConsentResponse).consent;
}

export async function fetchRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
  entryStatus?: RecommendationRequest["entryStatus"],
  preferredRegion?: PreferredRegion,
  excludePlaceIds?: string[],
): Promise<RecommendationResponse> {
  const request: RecommendationRequest = {
    answers,
    location,
    entryStatus,
    preferredRegion: location ? undefined : preferredRegion,
    excludePlaceIds,
  };
  const response = await fetchWithSession("recommendations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const fallbackMessage = "추천 데이터를 불러오지 못했어요.";
    let payload: RecommendationErrorResponse | null = null;
    try {
      payload = (await response.json()) as RecommendationErrorResponse;
    } catch {
      // 응답 본문을 읽지 못해도 상태 코드를 보존한다.
    }
    throw new RecommendationRequestError(
      typeof payload?.error === "string" ? payload.error : fallbackMessage,
      response.status,
      payload?.code,
    );
  }

  return (await response.json()) as RecommendationResponse;
}

export class RecommendationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: RecommendationErrorCode,
  ) {
    super(message);
    this.name = "RecommendationRequestError";
  }
}

export async function fetchNearbyAccommodations(
  placeId: string,
): Promise<NearbyAccommodationsResponse> {
  const response = await fetch(
    apiUrl(`places/${encodeURIComponent(placeId)}/accommodations`),
  );
  if (!response.ok) {
    throw new Error("주변 숙박 정보를 불러오지 못했어요.");
  }
  return (await response.json()) as NearbyAccommodationsResponse;
}

export async function recordRecommendationAction(
  input: RecommendationActionInput,
) {
  const response = await fetchWithSession("recommendation-actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "행동을 기록하지 못했어요."),
    );
  }

  return (await response.json()) as RecommendationActionResponse;
}

export async function fetchPlaceDetail(
  placeId: string,
): Promise<PlaceDetailResponse> {
  const response = await fetch(
    apiUrl(`places/${encodeURIComponent(placeId)}/detail`),
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "장소 정보를 불러오지 못했어요."),
    );
  }

  const data = (await response.json()) as PlaceDetailResponse;
  return data;
}

export async function fetchDeparturePlan(
  placeId: string,
  origin: UserLocation,
): Promise<DeparturePlan> {
  const response = await fetchWithSession(
    `places/${encodeURIComponent(placeId)}/departure-plan`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "출발 계획을 불러오지 못했어요."),
    );
  }

  const data = (await response.json()) as DeparturePlanResponse;
  return data.plan;
}

export async function fetchTravelTime(
  placeId: string,
  origin: UserLocation,
): Promise<TravelTimeSummary | null> {
  const response = await fetchWithSession(
    `places/${encodeURIComponent(placeId)}/travel-time`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "이동 시간을 불러오지 못했어요."),
    );
  }

  const data = (await response.json()) as TravelTimeResponse;
  return data.summary;
}

export async function fetchNearbyPlaces(
  location: UserLocation,
): Promise<NearbyPlaceResult[]> {
  const response = await fetchWithSession("places/nearby", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location }),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "사진 주변의 장소를 찾지 못했어요."),
    );
  }

  const data = (await response.json()) as NearbyPlacesResponse;
  return data.places;
}

export async function fetchJournalEntries(): Promise<TutiJournalEntry[]> {
  const response = await fetchWithSession("journal-entries");

  if (!response.ok) {
    throw new Error("기록을 불러오지 못했어요.");
  }

  const data = (await response.json()) as JournalEntriesResponse;
  return data.entries.map(resolveJournalEntryImage);
}

export async function createJournalEntry(
  input: JournalEntryInput,
): Promise<TutiJournalEntry> {
  const response = await fetchWithSession("journal-entries", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "기록을 저장하지 못했어요."),
    );
  }

  const data = (await response.json()) as JournalEntryResponse;
  return resolveJournalEntryImage(data.entry);
}

export async function updateJournalEntry(
  entryId: string,
  input: JournalEntryInput,
): Promise<TutiJournalEntry> {
  const response = await fetchWithSession(
    `journal-entries/${encodeURIComponent(entryId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "기록을 수정하지 못했어요."),
    );
  }

  const data = (await response.json()) as JournalEntryResponse;
  return resolveJournalEntryImage(data.entry);
}

export async function deleteJournalEntry(entryId: string) {
  const response = await fetchWithSession(
    `journal-entries/${encodeURIComponent(entryId)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "기록을 삭제하지 못했어요."),
    );
  }

  const data = (await response.json()) as DeleteJournalEntryResponse;
  return data.entryId;
}

export async function setJournalEntryPublication(
  entryId: string,
  published: boolean,
) {
  const response = await fetchWithSession(
    `journal-entries/${encodeURIComponent(entryId)}/publication`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ published }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        "기록 공개 설정을 변경하지 못했어요.",
      ),
    );
  }

  const data = (await response.json()) as JournalPublicationResponse;
  return resolveJournalEntryImage(data.entry);
}

export async function issueJournalShareTrace(
  entryId: string,
): Promise<JournalShareTraceIssue> {
  const response = await fetchWithSession(
    `journal-entries/${encodeURIComponent(entryId)}/share-traces`,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        "공유 이미지 추적 번호를 만들지 못했어요.",
      ),
    );
  }

  const data = (await response.json()) as JournalShareTraceIssueResponse;
  return data.trace;
}

export async function finalizeJournalShareTrace(
  entryId: string,
  traceId: string,
  png: Blob,
): Promise<JournalShareTraceFinalization> {
  const response = await fetchWithSession(
    [
      "journal-entries",
      encodeURIComponent(entryId),
      "share-traces",
      encodeURIComponent(traceId),
      "finalize",
    ].join("/"),
    {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: png,
    },
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        "공유 이미지 추적 정보를 등록하지 못했어요.",
      ),
    );
  }

  const data =
    (await response.json()) as JournalShareTraceFinalizationResponse;
  return data.trace;
}

async function readApiError(response: Response, fallbackMessage: string) {
  try {
    const data = (await response.json()) as { error?: unknown };
    return typeof data.error === "string" ? data.error : fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function resolveJournalEntryImage(entry: TutiJournalEntry): TutiJournalEntry {
  if (!entry.image?.startsWith("/api/")) return entry;

  return {
    ...entry,
    image: apiUrl(entry.image.slice("/api/".length)),
  };
}
