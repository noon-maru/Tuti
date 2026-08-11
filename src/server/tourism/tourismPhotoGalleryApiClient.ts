const TOURISM_PHOTO_GALLERY_API_BASE_URL =
  "https://apis.data.go.kr/B551011/PhotoGalleryService1";
const TOURISM_PHOTO_GALLERY_API_SUCCESS_CODES = new Set(["00", "0000"]);

export type TourismPhotoGalleryItem = {
  galUseFlag?: string;
  galWebImageUrl?: string;
  galSearchKeyword?: string;
  galTitle?: string;
  galContentId?: string;
  galContentTypeId?: string;
  galCreatedtime?: string;
  galModifiedtime?: string;
  galPhotographyMonth?: string;
  galPhotographyLocation?: string;
  galPhotographer?: string;
};

export type TourismPhotoGalleryPage = {
  items: TourismPhotoGalleryItem[];
  pageNo: number;
  numOfRows: number;
  totalCount: number;
};

export type FetchTourismPhotoGalleryInput = {
  modifiedDate?: string;
  showFlag?: "0" | "1";
  pageNo: number;
  numOfRows: number;
};

type TourismPhotoGalleryApiEnvelope = {
  header?: {
    resultCode?: string;
    resultMsg?: string;
  };
  body?: {
    items?: {
      item?: TourismPhotoGalleryItem | TourismPhotoGalleryItem[];
    };
    pageNo?: number | string;
    numOfRows?: number | string;
    totalCount?: number | string;
  };
};

type TourismPhotoGalleryApiResponse = TourismPhotoGalleryApiEnvelope & {
  response?: TourismPhotoGalleryApiEnvelope;
};

export class TourismPhotoGalleryApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TourismPhotoGalleryApiError";
  }
}

export async function fetchTourismPhotoGalleryRecords({
  modifiedDate,
  showFlag = "1",
  pageNo,
  numOfRows,
}: FetchTourismPhotoGalleryInput): Promise<TourismPhotoGalleryPage> {
  const serviceKey =
    process.env.DATA_GO_KR_API_KEY?.trim();

  if (!serviceKey) {
    throw new TourismPhotoGalleryApiError(
      "DATA_GO_KR_API_KEY 환경변수가 설정되지 않았습니다.",
      "tourism_photo_gallery_api_not_configured",
    );
  }

  const url = new URL(
    `${TOURISM_PHOTO_GALLERY_API_BASE_URL}/gallerySyncDetailList1`,
  );
  url.search = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "Tuti",
    _type: "json",
    showflag: showFlag,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    ...(modifiedDate ? { modifiedtime: modifiedDate } : {}),
  }).toString();

  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new TourismPhotoGalleryApiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "관광사진 갤러리 API 응답 시간이 초과되었습니다."
        : "관광사진 갤러리 API에 연결하지 못했습니다.",
      "tourism_photo_gallery_api_unavailable",
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new TourismPhotoGalleryApiError(
      response.status === 401 || response.status === 403
        ? "관광사진 갤러리 API 인증 또는 활용신청 상태를 확인해주세요."
        : `관광사진 갤러리 API가 HTTP ${response.status} 응답을 반환했습니다.`,
      "tourism_photo_gallery_api_http_error",
    );
  }

  let payload: TourismPhotoGalleryApiResponse;

  try {
    payload = JSON.parse(text) as TourismPhotoGalleryApiResponse;
  } catch {
    throw new TourismPhotoGalleryApiError(
      "관광사진 갤러리 API 응답을 JSON으로 해석하지 못했습니다.",
      "tourism_photo_gallery_api_invalid_response",
    );
  }

  const envelope = payload.response ?? payload;
  const header = envelope.header;
  const body = envelope.body;

  if (
    !header?.resultCode ||
    !TOURISM_PHOTO_GALLERY_API_SUCCESS_CODES.has(header.resultCode) ||
    !body
  ) {
    throw new TourismPhotoGalleryApiError(
      header?.resultMsg
        ? `관광사진 갤러리 API 요청이 실패했습니다: ${header.resultMsg}`
        : "관광사진 갤러리 API 응답 형식을 확인하지 못했습니다.",
      header?.resultCode ?? "tourism_photo_gallery_api_invalid_response",
    );
  }

  const item = body.items?.item;

  return {
    items: Array.isArray(item) ? item : item ? [item] : [],
    pageNo: toFiniteNumber(body.pageNo, pageNo),
    numOfRows: toFiniteNumber(body.numOfRows, numOfRows),
    totalCount: toFiniteNumber(body.totalCount, 0),
  };
}

function toFiniteNumber(value: number | string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
