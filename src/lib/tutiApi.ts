import type { TutiPlace } from "@/lib/recommendations";
import { apiUrl } from "@/lib/api/apiUrl";
import { fetchWithSession } from "@/lib/auth/session";
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
  TourismPlaceDetail,
} from "@/shared/api/placeDetails";
import type {
  RecommendationRequest,
  RecommendationResponse,
} from "@/shared/api/recommendations";
import type { IntakeAnswers, UserLocation } from "@/shared/tuti/types";

export async function fetchRecommendations(
  answers: IntakeAnswers,
  location?: UserLocation,
): Promise<TutiPlace[]> {
  const request: RecommendationRequest = { answers, location };
  const response = await fetch(apiUrl("recommendations"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("추천 데이터를 불러오지 못했어요.");
  }

  const data = (await response.json()) as RecommendationResponse;
  return data.places;
}

export async function fetchPlaceDetail(
  placeId: string,
): Promise<TourismPlaceDetail> {
  const response = await fetch(
    apiUrl(`places/${encodeURIComponent(placeId)}/detail`),
  );

  if (!response.ok) {
    throw new Error(
      await readApiError(response, "장소 정보를 불러오지 못했어요."),
    );
  }

  const data = (await response.json()) as PlaceDetailResponse;
  return data.detail;
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
