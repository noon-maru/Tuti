"use client";

import styled from "@emotion/styled";
import Link from "next/link";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  adminJsonRequest,
  AdminApiError,
  fetchAdminJson,
} from "@/lib/adminApi";
import type {
  ExternalDataSyncRunItem,
  TourismDataResponse,
  TourismDataSyncResponse,
  TourismDataTab,
  TourismPlaceSourceItem,
  TourismRegionMetricItem,
  WellnessTourismSourceItem,
  MunicipalCoreTourismSourceItem,
  TouristSpotConcentrationRateItem,
  RegionalVisitorCountItem,
  TourismPhotoGallerySourceItem,
} from "@/shared/api/tourismAdmin";
import { tourApiSidoOptions } from "@/shared/tourism/tourApiRegions";

type SyncSource =
  | "places"
  | "wellness"
  | "municipalCore"
  | "concentration"
  | "visitorMetropolitan"
  | "visitorMunicipal"
  | "photos"
  | "serviceDemand"
  | "culturalResourceDemand"
  | "stayIntensity"
  | "consumptionIntensity";

const tabs: Array<{ id: TourismDataTab; label: string }> = [
  { id: "places", label: "장소 원본" },
  { id: "wellness", label: "웰니스 원본" },
  { id: "municipalCore", label: "중심 관광지" },
  { id: "concentration", label: "집중률" },
  { id: "visitors", label: "방문자 수" },
  { id: "photos", label: "관광사진" },
  { id: "metrics", label: "지역 지표" },
  { id: "runs", label: "동기화 기록" },
];

const sourceOptions: Array<{ value: SyncSource; label: string }> = [
  { value: "places", label: "국문 관광정보" },
  { value: "wellness", label: "웰니스 관광정보" },
  { value: "municipalCore", label: "기초지자체 중심 관광지" },
  { value: "concentration", label: "관광지 집중률" },
  { value: "visitorMetropolitan", label: "광역 방문자 수" },
  { value: "visitorMunicipal", label: "기초 방문자 수" },
  { value: "photos", label: "관광사진 갤러리" },
  { value: "serviceDemand", label: "관광 서비스 수요" },
  { value: "culturalResourceDemand", label: "문화 자원 수요" },
  { value: "stayIntensity", label: "관광 체류 강도" },
  { value: "consumptionIntensity", label: "관광 소비 강도" },
];

const metricOptions: Record<
  Exclude<
    SyncSource,
    "places" | "wellness" | "municipalCore" | "concentration"
      | "visitorMetropolitan" | "visitorMunicipal"
      | "photos"
  >,
  Array<{ value: string; label: string }>
> = {
  serviceDemand: [
    { value: "11", label: "관광 서비스 수요 종합" },
    { value: "1101", label: "레포츠 SNS 언급량" },
    { value: "1102", label: "휴식·힐링 SNS 언급량" },
    { value: "1103", label: "미식 SNS 언급량" },
    { value: "1104", label: "체험 SNS 언급량" },
    { value: "1105", label: "쇼핑업 소비액" },
    { value: "1106", label: "식음료 소비액" },
    { value: "1107", label: "숙박업 소비액" },
    { value: "1108", label: "여가 서비스업 소비액" },
    { value: "1109", label: "운송업 소비액" },
    { value: "1110", label: "내비게이션 숙박 검색량" },
    { value: "1111", label: "내비게이션 음식 검색량" },
    { value: "1112", label: "내비게이션 쇼핑 검색량" },
  ],
  culturalResourceDemand: [
    { value: "12", label: "문화·자연 자원 수요 종합" },
    { value: "1201", label: "문화 관광 검색량" },
    { value: "1202", label: "레저 스포츠 검색량" },
    { value: "1203", label: "역사 관광 검색량" },
    { value: "1204", label: "체험 관광 검색량" },
    { value: "1205", label: "자연 관광 검색량" },
  ],
  stayIntensity: [
    { value: "21", label: "관광 체류 강도 종합" },
    { value: "2101", label: "타권역 방문자 비중" },
    { value: "2102", label: "숙박 비중" },
    { value: "2103", label: "1박 방문자 수" },
    { value: "2104", label: "2박 방문자 수" },
    { value: "2105", label: "3박 이상 방문자 수" },
  ],
  consumptionIntensity: [
    { value: "22", label: "관광 소비 강도 종합" },
    { value: "2201", label: "외지인 소비액" },
    { value: "2202", label: "외지인 소비 비중" },
    { value: "2203", label: "방문량 대비 소비액" },
  ],
};

const wellnessThemeOptions = [
  ["", "전체 테마"],
  ["EX050100", "온천·사우나·스파"],
  ["EX050200", "찜질방"],
  ["EX050300", "한방 체험"],
  ["EX050400", "힐링 명상"],
  ["EX050500", "뷰티 스파"],
  ["EX050600", "기타 웰니스"],
  ["EX050700", "자연 치유"],
] as const;

const areaOptions = [
  ["11", "서울특별시"],
  ["26", "부산광역시"],
  ["27", "대구광역시"],
  ["28", "인천광역시"],
  ["29", "광주광역시"],
  ["30", "대전광역시"],
  ["31", "울산광역시"],
  ["36", "세종특별자치시"],
  ["41", "경기도"],
  ["43", "충청북도"],
  ["44", "충청남도"],
  ["46", "전라남도"],
  ["47", "경상북도"],
  ["48", "경상남도"],
  ["50", "제주특별자치도"],
  ["51", "강원특별자치도"],
  ["52", "전북특별자치도"],
] as const;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function TourismDataScreen({
  initialTab,
}: {
  initialTab: TourismDataTab;
}) {
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState<TourismDataResponse | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [placeSido, setPlaceSido] = useState("");
  const [placeSigungu, setPlaceSigungu] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reviewingPlaces, setReviewingPlaces] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<number | null>(null);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileToolsDragOffset, setMobileToolsDragOffset] = useState(0);
  const [mobileToolsDragging, setMobileToolsDragging] = useState(false);
  const mobileToolsDragStart = useRef({ y: 0, time: 0 });

  const closeMobileTools = useCallback(() => {
    setMobileToolsOpen(false);
    setMobileToolsDragging(false);
    setMobileToolsDragOffset(0);
  }, []);

  const openMobileTools = () => {
    setMobileToolsDragging(false);
    setMobileToolsDragOffset(0);
    setMobileToolsOpen(true);
  };

  const handleMobileToolsPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    mobileToolsDragStart.current = {
      y: event.clientY,
      time: performance.now(),
    };
    setMobileToolsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMobileToolsPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!mobileToolsDragging) return;
    setMobileToolsDragOffset(
      Math.max(0, event.clientY - mobileToolsDragStart.current.y),
    );
  };

  const finishMobileToolsDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!mobileToolsDragging) return;

    const distance = Math.max(
      0,
      event.clientY - mobileToolsDragStart.current.y,
    );
    const elapsed = Math.max(
      1,
      performance.now() - mobileToolsDragStart.current.time,
    );
    const velocity = distance / elapsed;

    setMobileToolsDragging(false);

    if (distance >= 72 || (distance >= 32 && velocity >= 0.5)) {
      closeMobileTools();
    } else {
      setMobileToolsDragOffset(0);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const searchParams = new URLSearchParams({ tab });
    searchParams.set("page", String(page));
    searchParams.set("take", "100");

    if (appliedQuery) searchParams.set("q", appliedQuery);
    if (tab === "places" && placeSido) {
      searchParams.set("sido", placeSido);
    }
    if (tab === "places" && placeSigungu) {
      searchParams.set("sigungu", placeSigungu);
    }

    try {
      const response = await fetchAdminJson<TourismDataResponse>(
        `tourism-data?${searchParams}`,
      );
      setData(response);
      if (page > response.pagination.totalPages) {
        setPage(response.pagination.totalPages);
      }
      setAccessStatus(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
      setAccessStatus(
        loadError instanceof AdminApiError ? loadError.status : null,
      );
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page, placeSido, placeSigungu, tab]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    const handlePopState = () => {
      setPage(1);
      setTab(
        normalizeTab(
          new URL(window.location.href).searchParams.get("tab"),
        ),
      );
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!mobileToolsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileTools();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeMobileTools, mobileToolsOpen]);

  const changeTab = (nextTab: TourismDataTab) => {
    setTab(nextTab);
    setQuery("");
    setAppliedQuery("");
    setPlaceSido("");
    setPlaceSigungu("");
    setPage(1);
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.pushState({}, "", url);
  };

  const sync = async (input: Record<string, unknown>) => {
    setSyncing(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetchAdminJson<TourismDataSyncResponse>(
        "tourism-data",
        adminJsonRequest("POST", input),
      );
      const { result } = response;
      setNotice(
        `${result.received}건 확인 · ${result.created}건 추가 · ${result.updated}건 갱신 · ${result.skipped}건 제외`,
      );
      await load();
    } catch (syncError) {
      setError(toErrorMessage(syncError));
    } finally {
      setSyncing(false);
    }
  };

  const updatePlaceReview = async (input: Record<string, unknown>) => {
    setReviewingPlaces(true);
    setError(null);
    setNotice(null);

    try {
      await fetchAdminJson("places", adminJsonRequest("PATCH", input));
      setNotice("장소 검수 정보를 저장했습니다.");
      await load();
    } catch (updateError) {
      setError(toErrorMessage(updateError));
    } finally {
      setReviewingPlaces(false);
    }
  };

  const bulkReviewPlaces = async (
    placeIds: string[],
    reviewStatus: "approved" | "rejected",
  ) => {
    setReviewingPlaces(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetchAdminJson<{ count: number }>(
        "places",
        adminJsonRequest("POST", {
          action: "bulkReview",
          placeIds,
          reviewStatus,
        }),
      );
      setNotice(`${response.count}개 장소의 검수 상태를 변경했습니다.`);
      await load();
    } catch (updateError) {
      setError(toErrorMessage(updateError));
    } finally {
      setReviewingPlaces(false);
    }
  };

  if (accessStatus === 401 || accessStatus === 403) {
    return (
      <AccessPage>
        <AccessCard>
          <strong>Tuti Admin</strong>
          <h1>관리자 권한이 필요해요.</h1>
          <p>{error}</p>
          <PrimaryLink href="/login">로그인하기</PrimaryLink>
        </AccessCard>
      </AccessPage>
    );
  }

  return (
    <Page>
      <Header>
        <HeaderInner>
          <BackLink href="/admin?section=places" aria-label="관리자로 돌아가기">
            ‹
          </BackLink>
          <div>
            <Eyebrow>TUTI ADMIN</Eyebrow>
            <h1>관광 데이터</h1>
          </div>
          <RefreshButton type="button" onClick={() => void load()}>
            새로고침
          </RefreshButton>
        </HeaderInner>
      </Header>

      <Content>
        <DesktopDataTools>
          {data && <Overview overview={data.overview} />}
          <SyncPanel syncing={syncing} onSync={sync} />
        </DesktopDataTools>

        <MobileToolsButton
          type="button"
          onClick={openMobileTools}
        >
          <span>데이터 도구</span>
          <small>
            {data
              ? `원본 ${data.overview.placeSourceRecords.toLocaleString("ko-KR")}건 · 동기화 및 연결 상태`
              : "동기화 및 연결 상태"}
          </small>
          <b aria-hidden="true">›</b>
        </MobileToolsButton>

        <Tabs aria-label="관광 데이터 구분">
          {tabs.map((item) => (
            <TabButton
              key={item.id}
              type="button"
              $active={tab === item.id}
              onClick={() => changeTab(item.id)}
            >
              {item.label}
            </TabButton>
          ))}
        </Tabs>

        <SearchForm
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setAppliedQuery(query.trim());
          }}
        >
          <Input
            value={query}
            placeholder="원본 ID, 지역명, 지표 또는 실행 상태 검색"
            onChange={(event) => setQuery(event.target.value)}
          />
          <PrimaryButton type="submit">검색</PrimaryButton>
        </SearchForm>

        {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
        {notice && <SuccessNotice role="status">{notice}</SuccessNotice>}

        {loading ? (
          <StatePanel>관광 데이터를 불러오고 있어요.</StatePanel>
        ) : tab === "places" ? (
          <PlaceRecords
            records={data?.places ?? []}
            pagination={data?.pagination}
            sigunguOptions={data?.placeFilters.sigunguNames ?? []}
            selectedSido={placeSido}
            selectedSigungu={placeSigungu}
            onSidoChange={(nextSido) => {
              setPage(1);
              setPlaceSido(nextSido);
              setPlaceSigungu("");
            }}
            onSigunguChange={(nextSigungu) => {
              setPage(1);
              setPlaceSigungu(nextSigungu);
            }}
            reviewing={reviewingPlaces}
            onPlaceUpdate={updatePlaceReview}
            onBulkReview={bulkReviewPlaces}
          />
        ) : tab === "wellness" ? (
          <WellnessRecords records={data?.wellness ?? []} />
        ) : tab === "municipalCore" ? (
          <MunicipalCoreRecords records={data?.municipalCore ?? []} />
        ) : tab === "concentration" ? (
          <ConcentrationRecords records={data?.concentration ?? []} />
        ) : tab === "visitors" ? (
          <VisitorRecords records={data?.visitors ?? []} />
        ) : tab === "photos" ? (
          <PhotoRecords records={data?.photos ?? []} />
        ) : tab === "metrics" ? (
          <MetricRecords metrics={data?.metrics ?? []} />
        ) : (
          <SyncRuns runs={data?.runs ?? []} />
        )}

        {!loading && data && data.pagination.totalPages > 1 && (
          <DataPagination
            pagination={data.pagination}
            onPageChange={setPage}
          />
        )}
      </Content>

      {mobileToolsOpen && (
        <MobileToolsBackdrop
          $dragOffset={mobileToolsDragOffset}
          $dragging={mobileToolsDragging}
          role="presentation"
          onMouseDown={closeMobileTools}
        >
          <MobileToolsDrawer
            $dragOffset={mobileToolsDragOffset}
            $dragging={mobileToolsDragging}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-data-tools-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <MobileToolsHandle
              type="button"
              aria-label="아래로 끌어 데이터 도구 닫기"
              onPointerDown={handleMobileToolsPointerDown}
              onPointerMove={handleMobileToolsPointerMove}
              onPointerUp={finishMobileToolsDrag}
              onPointerCancel={finishMobileToolsDrag}
            >
              <span />
            </MobileToolsHandle>
            <MobileToolsHeader>
              <div>
                <span>관리자 도구</span>
                <h2 id="mobile-data-tools-title">데이터 현황과 동기화</h2>
              </div>
              <DrawerCloseButton
                type="button"
                onClick={closeMobileTools}
                aria-label="데이터 도구 닫기"
              >
                ×
              </DrawerCloseButton>
            </MobileToolsHeader>
            {data && <Overview overview={data.overview} />}
            <SyncPanel syncing={syncing} onSync={sync} />
          </MobileToolsDrawer>
        </MobileToolsBackdrop>
      )}
    </Page>
  );
}

function Overview({
  overview,
}: {
  overview: TourismDataResponse["overview"];
}) {
  const metrics = [
    ["장소 원본", overview.placeSourceRecords],
    ["웰니스 원본", overview.wellnessSourceRecords],
    ["중심 관광지", overview.municipalCoreSourceRecords],
    ["집중률 원본", overview.touristSpotConcentrationRecords],
    ["방문자 수", overview.regionalVisitorCountRecords],
    ["관광사진", overview.tourismPhotoGalleryRecords],
    ["지역 지표", overview.regionalMetrics],
    ["동기화 실행", overview.syncRuns],
    ["확인 필요", overview.failedRuns],
  ];

  return (
    <OverviewSection>
      <ConnectionList>
        {overview.connections.map((connection) => (
          <ConnectionBadge
            key={connection.source}
            $configured={connection.configured}
          >
            <span />
            {connection.label}
            <small>{connection.configured ? "연결됨" : "키 없음"}</small>
          </ConnectionBadge>
        ))}
      </ConnectionList>
      <MetricGrid>
        {metrics.map(([label, value]) => (
          <MetricCard key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </MetricCard>
        ))}
      </MetricGrid>
      <LastSync>
        마지막 동기화{" "}
        {overview.lastSyncedAt
          ? formatDate(overview.lastSyncedAt)
          : "기록 없음"}
      </LastSync>
    </OverviewSection>
  );
}

function SyncPanel({
  syncing,
  onSync,
}: {
  syncing: boolean;
  onSync: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [source, setSource] = useState<SyncSource>("places");
  const [contentTypeId, setContentTypeId] = useState("12");
  const [tourismAreaCode, setTourismAreaCode] = useState("");
  const [tourismSigunguCode, setTourismSigunguCode] = useState("");
  const [baseMonth, setBaseMonth] = useState("2025-09");
  const [areaCode, setAreaCode] = useState("11");
  const [sigunguCode, setSigunguCode] = useState("");
  const [municipalSigunguCode, setMunicipalSigunguCode] = useState("11530");
  const [concentrationSpotName, setConcentrationSpotName] = useState("");
  const [visitorDate, setVisitorDate] = useState(() =>
    toDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
  );
  const [photoModifiedDate, setPhotoModifiedDate] = useState("");
  const [metricCode, setMetricCode] = useState("11");
  const [wellnessThemeCode, setWellnessThemeCode] = useState("");
  const selectedMetricOptions = useMemo(
    () =>
      source === "places" ||
      source === "wellness" ||
      source === "municipalCore" ||
      source === "concentration" ||
      source === "visitorMetropolitan" ||
      source === "visitorMunicipal" ||
      source === "photos"
        ? []
        : metricOptions[source],
    [source],
  );

  const changeSource = (nextSource: SyncSource) => {
    setSource(nextSource);

    if (nextSource === "wellness") {
      setAreaCode("");
      setSigunguCode("");
    } else if (nextSource === "municipalCore") {
      setAreaCode((current) => current || "11");
    } else if (nextSource === "concentration") {
      setAreaCode((current) => current || "11");
    } else if (
      nextSource === "visitorMetropolitan" ||
      nextSource === "visitorMunicipal"
    ) {
      // 지역별 방문자 수 API는 날짜 기준 전국 집계만 받습니다.
    } else if (nextSource === "photos") {
      // 사진 API는 수정일 조건 없이도 전체 동기화할 수 있습니다.
    } else if (nextSource !== "places") {
      setAreaCode((current) => current || "11");
      setMetricCode(metricOptions[nextSource][0].value);
    }
  };

  return (
    <SyncSection>
      <div>
        <h2>공공데이터 동기화</h2>
        <p>원본을 먼저 저장해 검수와 추천 데이터로 활용할 수 있게 합니다.</p>
      </div>
      <SyncForm
        onSubmit={(event) => {
          event.preventDefault();
          void onSync(
            source === "places"
              ? {
                  kind: "places",
                  contentTypeId,
                  areaCode: tourismAreaCode,
                  sigunguCode: tourismSigunguCode,
                }
              : source === "wellness"
                ? {
                    kind: "wellness",
                    contentTypeId: "12",
                    wellnessThemeCode,
                    areaCode,
                    sigunguCode,
                  }
                : source === "municipalCore"
                  ? {
                      kind: "municipalCore",
                      baseYm: baseMonth.replace("-", ""),
                      areaCode,
                      sigunguCode: municipalSigunguCode,
                    }
                  : source === "concentration"
                    ? {
                        kind: "concentration",
                        areaCode,
                        sigunguCode: municipalSigunguCode,
                        touristSpotName: concentrationSpotName,
                      }
                    : source === "visitorMetropolitan" ||
                        source === "visitorMunicipal"
                      ? {
                          kind: "visitors",
                          aggregationLevel:
                            source === "visitorMetropolitan"
                              ? "metropolitan"
                              : "municipal",
                          baseYmd: visitorDate.replaceAll("-", ""),
                        }
                      : source === "photos"
                        ? {
                            kind: "photos",
                            modifiedDate: photoModifiedDate.replaceAll("-", ""),
                          }
              : {
                  kind: "metrics",
                  metricType: source,
                  metricCode,
                  baseYm: baseMonth.replace("-", ""),
                  areaCode,
                  sigunguCode,
                },
          );
        }}
      >
        <Field>
          <span>데이터 소스</span>
          <Select
            value={source}
            disabled={syncing}
            onChange={(event) =>
              changeSource(event.target.value as SyncSource)
            }
          >
            {sourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {source === "places" ? (
          <>
            <Field>
              <span>콘텐츠 유형</span>
              <Select
                value={contentTypeId}
                disabled={syncing}
                onChange={(event) => setContentTypeId(event.target.value)}
              >
                <option value="12">관광지</option>
                <option value="14">문화시설</option>
                <option value="25">여행코스</option>
                <option value="28">레포츠</option>
              </Select>
            </Field>
            <Field>
              <span>시도 · 선택</span>
              <Select
                value={tourismAreaCode}
                disabled={syncing}
                onChange={(event) => {
                  setTourismAreaCode(event.target.value);
                  if (!event.target.value) setTourismSigunguCode("");
                }}
              >
                <option value="">전국</option>
                {tourApiSidoOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <span>시군구 코드 · 선택</span>
              <Input
                value={tourismSigunguCode}
                inputMode="numeric"
                disabled={syncing || !tourismAreaCode}
                placeholder="TourAPI 시군구 코드"
                onChange={(event) => setTourismSigunguCode(event.target.value)}
              />
            </Field>
          </>
        ) : source === "wellness" ? (
          <>
            <Field>
              <span>웰니스 테마</span>
              <Select
                value={wellnessThemeCode}
                disabled={syncing}
                onChange={(event) =>
                  setWellnessThemeCode(event.target.value)
                }
              >
                {wellnessThemeOptions.map(([value, label]) => (
                  <option key={value || "all"} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <span>지역 · 선택</span>
              <Select
                value={areaCode}
                disabled={syncing}
                onChange={(event) => {
                  setAreaCode(event.target.value);
                  if (!event.target.value) setSigunguCode("");
                }}
              >
                <option value="">전국</option>
                {areaOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <span>시군구 코드 · 선택</span>
              <Input
                value={sigunguCode}
                inputMode="numeric"
                disabled={syncing || !areaCode}
                placeholder="비우면 전체"
                onChange={(event) => setSigunguCode(event.target.value)}
              />
            </Field>
          </>
        ) : source === "municipalCore" ? (
          <>
            <Field>
              <span>기준월</span>
              <Input
                type="month"
                value={baseMonth}
                disabled={syncing}
                onChange={(event) => setBaseMonth(event.target.value)}
              />
            </Field>
            <Field>
              <span>지역</span>
              <Select
                value={areaCode}
                disabled={syncing}
                onChange={(event) => {
                  setAreaCode(event.target.value);
                  setMunicipalSigunguCode("");
                }}
              >
                {areaOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <span>시군구 코드</span>
              <Input
                value={municipalSigunguCode}
                inputMode="numeric"
                disabled={syncing}
                placeholder="예: 11530"
                onChange={(event) =>
                  setMunicipalSigunguCode(event.target.value)
                }
              />
            </Field>
          </>
        ) : source === "concentration" ? (
          <>
            <Field>
              <span>지역</span>
              <Select
                value={areaCode}
                disabled={syncing}
                onChange={(event) => {
                  setAreaCode(event.target.value);
                  setMunicipalSigunguCode("");
                }}
              >
                {areaOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <span>시군구 코드</span>
              <Input
                value={municipalSigunguCode}
                inputMode="numeric"
                disabled={syncing}
                placeholder="예: 11530"
                onChange={(event) =>
                  setMunicipalSigunguCode(event.target.value)
                }
              />
            </Field>
            <Field>
              <span>관광지명 · 선택</span>
              <Input
                value={concentrationSpotName}
                disabled={syncing}
                placeholder="비우면 해당 시군구 전체"
                onChange={(event) =>
                  setConcentrationSpotName(event.target.value)
                }
              />
            </Field>
          </>
        ) : source === "visitorMetropolitan" ||
            source === "visitorMunicipal" ? (
          <>
            <Field>
              <span>기준일</span>
              <Input
                type="date"
                value={visitorDate}
                disabled={syncing}
                onChange={(event) => setVisitorDate(event.target.value)}
              />
            </Field>
            <SyncHint>
              {source === "visitorMetropolitan"
                ? "시도별 방문자 수를 수집합니다."
                : "시군구별 방문자 수를 수집합니다."}
            </SyncHint>
          </>
        ) : source === "photos" ? (
          <>
            <Field>
              <span>수정일 · 선택</span>
              <Input
                type="date"
                value={photoModifiedDate}
                disabled={syncing}
                onChange={(event) =>
                  setPhotoModifiedDate(event.target.value)
                }
              />
            </Field>
            <SyncHint>
              비워두면 공개된 사진 전체에서 첫 500건을 동기화합니다.
            </SyncHint>
          </>
        ) : (
          <>
            <Field>
              <span>지표</span>
              <Select
                value={metricCode}
                disabled={syncing}
                onChange={(event) => setMetricCode(event.target.value)}
              >
                {selectedMetricOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <span>기준월</span>
              <Input
                type="month"
                value={baseMonth}
                disabled={syncing}
                onChange={(event) => setBaseMonth(event.target.value)}
              />
            </Field>
            <Field>
              <span>지역</span>
              <Select
                value={areaCode}
                disabled={syncing}
                onChange={(event) => setAreaCode(event.target.value)}
              >
                {areaOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <span>시군구 코드 · 선택</span>
              <Input
                value={sigunguCode}
                inputMode="numeric"
                disabled={syncing}
                placeholder="비우면 전체"
                onChange={(event) => setSigunguCode(event.target.value)}
              />
            </Field>
          </>
        )}

        <PrimaryButton
          type="submit"
          disabled={
            syncing ||
            (source === "municipalCore" &&
              (!baseMonth || !municipalSigunguCode)) ||
            (source === "concentration" && !municipalSigunguCode) ||
            ((source === "visitorMetropolitan" ||
              source === "visitorMunicipal") &&
              !visitorDate) ||
            (source !== "places" &&
              source !== "wellness" &&
              source !== "municipalCore" &&
              source !== "concentration" &&
              source !== "visitorMetropolitan" &&
              source !== "visitorMunicipal" &&
              source !== "photos" &&
              !baseMonth)
          }
        >
          {syncing ? "동기화 중..." : "동기화 시작"}
        </PrimaryButton>
      </SyncForm>
    </SyncSection>
  );
}

function MunicipalCoreRecords({
  records,
}: {
  records: MunicipalCoreTourismSourceItem[];
}) {
  if (records.length === 0) {
    return <StatePanel>저장된 중심 관광지 원본이 없습니다.</StatePanel>;
  }

  return (
    <RecordList>
      {records.map((record) => (
        <RecordCard key={record.id}>
          <RecordHeader>
            <div>
              <h2>{record.touristSpotName}</h2>
              <p>
                {record.areaName} {record.sigunguName} ·{" "}
                {formatBaseYm(record.baseYm)}
              </p>
            </div>
            <MetricValue>#{record.rank}</MetricValue>
          </RecordHeader>
          <Metadata>
            {record.categoryLargeName ?? "분류 없음"}
            {record.categoryMediumName
              ? ` · ${record.categoryMediumName}`
              : ""}
            {" · "}관광지 코드 {record.touristSpotCode} · 동기화{" "}
            {formatDate(record.syncedAt)}
          </Metadata>
          <RawDetails payload={record.rawPayload} />
        </RecordCard>
      ))}
    </RecordList>
  );
}

function ConcentrationRecords({
  records,
}: {
  records: TouristSpotConcentrationRateItem[];
}) {
  if (records.length === 0) {
    return <StatePanel>저장된 관광지 집중률 원본이 없습니다.</StatePanel>;
  }

  return (
    <RecordList>
      {records.map((record) => (
        <RecordCard key={record.id}>
          <RecordHeader>
            <div>
              <h2>{record.touristSpotName}</h2>
              <p>
                {record.areaName} {record.sigunguName} ·{" "}
                {formatBaseYmd(record.baseYmd)}
              </p>
            </div>
            <MetricValue>{record.concentrationRate}%</MetricValue>
          </RecordHeader>
          <Metadata>
            관광지 집중률 · 동기화 {formatDate(record.syncedAt)}
          </Metadata>
          <RawDetails payload={record.rawPayload} />
        </RecordCard>
      ))}
    </RecordList>
  );
}

function VisitorRecords({
  records,
}: {
  records: RegionalVisitorCountItem[];
}) {
  if (records.length === 0) {
    return <StatePanel>저장된 지역별 방문자 수 원본이 없습니다.</StatePanel>;
  }

  return (
    <RecordList>
      {records.map((record) => (
        <RecordCard key={record.id}>
          <RecordHeader>
            <div>
              <h2>{record.regionName}</h2>
              <p>
                {record.aggregationLevel === "metropolitan"
                  ? "광역 지자체"
                  : "기초 지자체"}
                {" · "}
                {formatBaseYmd(record.baseYmd)} · {record.weekdayName}
              </p>
            </div>
            <MetricValue>{formatVisitorCount(record.visitorCount)}명</MetricValue>
          </RecordHeader>
          <Metadata>
            {record.visitorTypeName} · 코드 {record.regionCode} · 동기화{" "}
            {formatDate(record.syncedAt)}
          </Metadata>
          <RawDetails payload={record.rawPayload} />
        </RecordCard>
      ))}
    </RecordList>
  );
}

function PhotoRecords({
  records,
}: {
  records: TourismPhotoGallerySourceItem[];
}) {
  if (records.length === 0) {
    return <StatePanel>저장된 관광사진 원본이 없습니다.</StatePanel>;
  }

  return (
    <RecordList>
      {records.map((record) => (
        <RecordCard key={record.contentId}>
          <RecordHeader>
            <div>
              <h2>{record.title}</h2>
              <p>
                {record.photographyLocation ?? "촬영 장소 미상"}
                {record.photographyMonth
                  ? ` · ${record.photographyMonth}`
                  : ""}
              </p>
            </div>
            <PhotoLink
              href={record.imageUrl}
              target="_blank"
              rel="noreferrer"
            >
              이미지 열기
            </PhotoLink>
          </RecordHeader>
          <Metadata>
            {record.photographer ? `${record.photographer} · ` : ""}
            콘텐츠 {record.contentId} · 동기화 {formatDate(record.syncedAt)}
          </Metadata>
          <RawDetails payload={record.rawPayload} />
        </RecordCard>
      ))}
    </RecordList>
  );
}

function WellnessRecords({
  records,
}: {
  records: WellnessTourismSourceItem[];
}) {
  if (records.length === 0) {
    return <StatePanel>저장된 웰니스 관광 원본이 없습니다.</StatePanel>;
  }

  return (
    <RecordList>
      {records.map((record) => (
        <RecordCard key={record.id}>
          <RecordHeader>
            <div>
              <h2>{record.title}</h2>
              <p>
                콘텐츠 {record.contentId} · 유형{" "}
                {record.contentTypeId ?? "미분류"}
              </p>
            </div>
            <StatusBadge $tone="success">
              {getWellnessThemeLabel(record.wellnessThemeCode)}
            </StatusBadge>
          </RecordHeader>
          <Metadata>
            지역 {record.areaCode ?? "-"} / {record.sigunguCode ?? "-"} ·{" "}
            {record.langDivCd} · 동기화 {formatDate(record.syncedAt)}
          </Metadata>
          <RawDetails payload={record.rawPayload} />
        </RecordCard>
      ))}
    </RecordList>
  );
}

function PlaceRecords({
  records,
  pagination,
  sigunguOptions,
  selectedSido,
  selectedSigungu,
  onSidoChange,
  onSigunguChange,
  reviewing,
  onPlaceUpdate,
  onBulkReview,
}: {
  records: TourismPlaceSourceItem[];
  pagination?: TourismDataResponse["pagination"];
  sigunguOptions: string[];
  selectedSido: string;
  selectedSigungu: string;
  onSidoChange: (value: string) => void;
  onSigunguChange: (value: string) => void;
  reviewing: boolean;
  onPlaceUpdate: (input: Record<string, unknown>) => Promise<void>;
  onBulkReview: (
    placeIds: string[],
    reviewStatus: "approved" | "rejected",
  ) => Promise<void>;
}) {
  const [selectedRecord, setSelectedRecord] =
    useState<TourismPlaceSourceItem | null>(null);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const linkedCount = records.filter((record) => record.linkedPlaceId).length;
  const regionCount = new Set(
    records.map((record) => record.sidoName).filter(Boolean),
  ).size;
  const selectablePlaceIds = useMemo(
    () => records.flatMap((record) => (record.linkedPlace ? [record.linkedPlace.id] : [])),
    [records],
  );
  const visibleSelectedPlaceIds = selectedPlaceIds.filter((placeId) =>
    selectablePlaceIds.includes(placeId),
  );
  const selectedSet = new Set(visibleSelectedPlaceIds);
  const selectedCount = visibleSelectedPlaceIds.length;

  useEffect(() => {
    if (!selectedRecord) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRecord(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRecord]);

  if (records.length === 0) {
    return (
      <>
        <PlaceExplorerHeader>
          <div>
            <span>TOURAPI PLACE DATA</span>
            <h2>관광지 원천 데이터</h2>
            <p>시도와 시군구를 기준으로 저장된 원본을 빠르게 확인합니다.</p>
          </div>
          <PlaceFilterGroup>
            <PlaceFilterLabel>
              <span>시도</span>
              <Select
                value={selectedSido}
                onChange={(event) => onSidoChange(event.target.value)}
              >
                <option value="">전국</option>
                {tourApiSidoOptions.map(([, label]) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </Select>
            </PlaceFilterLabel>
            <PlaceFilterLabel>
              <span>시군구</span>
              <Select
                value={selectedSigungu}
                disabled={!selectedSido || sigunguOptions.length === 0}
                onChange={(event) => onSigunguChange(event.target.value)}
              >
                <option value="">전체</option>
                {sigunguOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </PlaceFilterLabel>
          </PlaceFilterGroup>
        </PlaceExplorerHeader>
        <StatePanel>조건에 맞는 장소 원본이 없습니다.</StatePanel>
      </>
    );
  }

  return (
    <>
      <PlaceExplorerHeader>
        <div>
          <span>TOURAPI PLACE DATA</span>
          <h2>관광지 원천 데이터</h2>
          <p>행을 선택하면 원본 필드와 연결 상태를 상세히 볼 수 있습니다.</p>
        </div>
        <PlaceFilterGroup>
          <PlaceFilterLabel>
            <span>시도</span>
            <Select
              value={selectedSido}
              onChange={(event) => onSidoChange(event.target.value)}
            >
              <option value="">전국</option>
              {tourApiSidoOptions.map(([, label]) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </Select>
          </PlaceFilterLabel>
          <PlaceFilterLabel>
            <span>시군구</span>
            <Select
              value={selectedSigungu}
              disabled={!selectedSido || sigunguOptions.length === 0}
              onChange={(event) => onSigunguChange(event.target.value)}
            >
              <option value="">전체</option>
              {sigunguOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </PlaceFilterLabel>
        </PlaceFilterGroup>
      </PlaceExplorerHeader>

      <PlaceDataSummary>
        <PlaceSummaryItem>
          <span>현재 목록</span>
          <strong>{records.length}건</strong>
        </PlaceSummaryItem>
        <PlaceSummaryItem>
          <span>장소 연결</span>
          <strong>{linkedCount}건</strong>
        </PlaceSummaryItem>
        <PlaceSummaryItem>
          <span>포함 시도</span>
          <strong>{regionCount}곳</strong>
        </PlaceSummaryItem>
        <PlaceSummaryHint>
          {pagination
            ? `검색 결과 ${pagination.totalItems.toLocaleString("ko-KR")}건 중 ${getPageRangeLabel(pagination)}`
            : "목록을 불러오는 중입니다."}
        </PlaceSummaryHint>
      </PlaceDataSummary>

      <PlaceReviewToolbar>
        <span>
          추천 후보 {selectablePlaceIds.length}건 중 {selectedCount}건 선택
        </span>
        <div>
          <ToolbarButton
            type="button"
            disabled={reviewing || selectedCount === 0}
            onClick={() => {
              void onBulkReview(visibleSelectedPlaceIds, "approved").then(() => {
                setSelectedPlaceIds([]);
              });
            }}
          >
            선택 승인·노출
          </ToolbarButton>
          <ToolbarButton
            type="button"
            $danger
            disabled={reviewing || selectedCount === 0}
            onClick={() => {
              void onBulkReview(visibleSelectedPlaceIds, "rejected").then(() => {
                setSelectedPlaceIds([]);
              });
            }}
          >
            선택 거절
          </ToolbarButton>
        </div>
      </PlaceReviewToolbar>

      <PlaceTable aria-label="관광지 원천 데이터 목록">
        <PlaceTableHead aria-hidden="true">
          <span />
          <span>지역</span>
          <span>관광지</span>
          <span>유형</span>
          <span>연결 상태</span>
          <span>최근 동기화</span>
        </PlaceTableHead>
        <PlaceTableBody>
          {records.map((record) => (
            <PlaceTableRow
              key={record.contentId}
            >
              <PlaceSelectionControl>
                <input
                  type="checkbox"
                  checked={record.linkedPlace ? selectedSet.has(record.linkedPlace.id) : false}
                  disabled={!record.linkedPlace || reviewing}
                  aria-label={`${record.title} 검수 선택`}
                  onChange={(event) => {
                    if (!record.linkedPlace) return;
                    setSelectedPlaceIds((current) =>
                      event.target.checked
                        ? [...new Set([...current, record.linkedPlace!.id])]
                        : current.filter((placeId) => placeId !== record.linkedPlace!.id),
                    );
                  }}
                />
              </PlaceSelectionControl>
              <PlaceRowDetailButton
                type="button"
                onClick={() => setSelectedRecord(record)}
                aria-label={`${record.title} 상세 보기`}
              >
                <PlaceTableCell $column="region">
                  <strong>{record.sidoName ?? "지역 미확인"}</strong>
                  <small>{record.sigunguName ?? "시군구 미확인"}</small>
                </PlaceTableCell>
                <PlaceTableCell $column="place">
                  <strong>{record.title}</strong>
                  <small>콘텐츠 {record.contentId}</small>
                </PlaceTableCell>
                <PlaceTableCell $column="type">
                  {getPlaceContentTypeLabel(record.contentTypeId)}
                </PlaceTableCell>
                <PlaceTableCell $column="status">
                  <StatusBadge $tone={getPlaceReviewTone(record)}>
                    {getPlaceReviewLabel(record)}
                  </StatusBadge>
                </PlaceTableCell>
                <PlaceTableCell $column="synced">
                  {formatDate(record.syncedAt)}
                </PlaceTableCell>
              </PlaceRowDetailButton>
            </PlaceTableRow>
          ))}
        </PlaceTableBody>
      </PlaceTable>

      {selectedRecord && (
        <PlaceDrawerBackdrop
          role="presentation"
          onMouseDown={() => setSelectedRecord(null)}
        >
          <PlaceDrawer
            role="dialog"
            aria-modal="true"
            aria-labelledby="place-drawer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <PlaceDrawerHandle />
            <PlaceDrawerHeader>
              <div>
                <span>TOURAPI 원본</span>
                <h2 id="place-drawer-title">{selectedRecord.title}</h2>
              </div>
              <DrawerCloseButton
                type="button"
                onClick={() => setSelectedRecord(null)}
                aria-label="상세 닫기"
              >
                ×
              </DrawerCloseButton>
            </PlaceDrawerHeader>
            <PlaceDrawerStatus>
              <StatusBadge $tone={getPlaceReviewTone(selectedRecord)}>
                {getPlaceReviewLabel(selectedRecord)}
              </StatusBadge>
              <span>{getPlaceContentTypeLabel(selectedRecord.contentTypeId)}</span>
            </PlaceDrawerStatus>
            <PlaceDetailGrid>
              <div>
                <span>지역</span>
                <strong>
                  {selectedRecord.sidoName ?? "지역 미확인"}
                  {selectedRecord.sigunguName
                    ? ` ${selectedRecord.sigunguName}`
                    : ""}
                </strong>
              </div>
              <div>
                <span>지역 코드</span>
                <strong>
                  {selectedRecord.areaCode ?? "-"} / {selectedRecord.sigunguCode ?? "-"}
                </strong>
              </div>
              <div>
                <span>콘텐츠 ID</span>
                <strong>{selectedRecord.contentId}</strong>
              </div>
              <div>
                <span>원본 수정</span>
                <strong>
                  {selectedRecord.sourceModifiedAt
                    ? formatDate(selectedRecord.sourceModifiedAt)
                    : "정보 없음"}
                </strong>
              </div>
              <div>
                <span>동기화</span>
                <strong>{formatDate(selectedRecord.syncedAt)}</strong>
              </div>
              <div>
                <span>연결된 장소</span>
                <strong>{selectedRecord.linkedPlace?.id ?? "후보 생성 불가"}</strong>
              </div>
            </PlaceDetailGrid>
            {selectedRecord.linkedPlace ? (
              <PlaceReviewEditor
                key={selectedRecord.linkedPlace.id}
                place={selectedRecord.linkedPlace}
                saving={reviewing}
                onSave={onPlaceUpdate}
              />
            ) : (
              <PlaceReviewUnavailable>
                이 원본에는 추천 후보를 만들기 위한 좌표 또는 대표 이미지가 부족합니다.
                원본을 보완한 뒤 다시 동기화해주세요.
              </PlaceReviewUnavailable>
            )}
            <RawDetails payload={selectedRecord.rawPayload} />
          </PlaceDrawer>
        </PlaceDrawerBackdrop>
      )}
    </>
  );
}

function DataPagination({
  pagination,
  onPageChange,
}: {
  pagination: TourismDataResponse["pagination"];
  onPageChange: (page: number) => void;
}) {
  const pages = getVisiblePageNumbers(
    pagination.page,
    pagination.totalPages,
  );

  return (
    <PaginationNav aria-label="관광 데이터 목록 페이지">
      <PaginationSummary>
        전체 {pagination.totalItems.toLocaleString("ko-KR")}건 ·{" "}
        {pagination.page.toLocaleString("ko-KR")} /{" "}
        {pagination.totalPages.toLocaleString("ko-KR")}페이지
      </PaginationSummary>
      <PaginationControls>
        <PaginationButton
          type="button"
          disabled={pagination.page === 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          이전
        </PaginationButton>
        <PaginationNumbers>
          {pages.map((pageNumber) => (
            <PaginationNumberButton
              key={pageNumber}
              type="button"
              $active={pageNumber === pagination.page}
              aria-current={
                pageNumber === pagination.page ? "page" : undefined
              }
              aria-label={`${pageNumber}페이지`}
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </PaginationNumberButton>
          ))}
        </PaginationNumbers>
        <PaginationButton
          type="button"
          disabled={pagination.page === pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          다음
        </PaginationButton>
      </PaginationControls>
    </PaginationNav>
  );
}

function PlaceReviewEditor({
  place,
  saving,
  onSave,
}: {
  place: NonNullable<TourismPlaceSourceItem["linkedPlace"]>;
  saving: boolean;
  onSave: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(place.name);
  const [phrase, setPhrase] = useState(place.phrase);
  const [note, setNote] = useState(place.note);
  const [image, setImage] = useState(place.image);
  const [travelTime, setTravelTime] = useState(place.travelTime);
  const [today, setToday] = useState(place.today);
  const [fatigue, setFatigue] = useState(String(place.fatigue));
  const [movementLevel, setMovementLevel] = useState(place.movementLevel);
  const [moodTags, setMoodTags] = useState(place.moodTags.join(", "));

  const saveEditorial = async () => {
    await onSave({
      placeId: place.id,
      name,
      phrase,
      note,
      image,
      travelTime,
      today,
      fatigue: Number(fatigue),
      movementLevel,
      moodTags: moodTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  };

  return (
    <PlaceReviewSection>
      <PlaceReviewHeader>
        <div>
          <span>추천 노출 보정</span>
          <h3>검수 정보</h3>
        </div>
        <StatusBadge $tone={place.reviewStatus}>
          {getPlaceReviewStatusLabel(place.reviewStatus)}
        </StatusBadge>
      </PlaceReviewHeader>
      <PlaceReviewForm
        onSubmit={(event) => {
          event.preventDefault();
          void saveEditorial();
        }}
      >
        <ReviewField>
          <span>장소명</span>
          <Input value={name} disabled={saving} onChange={(event) => setName(event.target.value)} />
        </ReviewField>
        <ReviewField>
          <span>한 줄 설명</span>
          <Input value={phrase} disabled={saving} onChange={(event) => setPhrase(event.target.value)} />
        </ReviewField>
        <ReviewField $wide>
          <span>장소 설명</span>
          <TextArea value={note} disabled={saving} rows={4} onChange={(event) => setNote(event.target.value)} />
        </ReviewField>
        <ReviewField $wide>
          <span>대표 이미지 주소</span>
          <Input value={image} disabled={saving} onChange={(event) => setImage(event.target.value)} />
        </ReviewField>
        <ReviewField>
          <span>이동 시간 안내</span>
          <Input value={travelTime} disabled={saving} onChange={(event) => setTravelTime(event.target.value)} />
        </ReviewField>
        <ReviewField>
          <span>오늘 안내</span>
          <Input value={today} disabled={saving} onChange={(event) => setToday(event.target.value)} />
        </ReviewField>
        <ReviewField>
          <span>피로도</span>
          <Select value={fatigue} disabled={saving} onChange={(event) => setFatigue(event.target.value)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </Select>
        </ReviewField>
        <ReviewField>
          <span>이동 거리</span>
          <Select value={movementLevel} disabled={saving} onChange={(event) => setMovementLevel(event.target.value as typeof movementLevel)}>
            <option value="near">집 근처</option>
            <option value="short">조금만</option>
            <option value="half">반나절 정도</option>
          </Select>
        </ReviewField>
        <ReviewField $wide>
          <span>분위기 태그 · 쉼표로 구분</span>
          <Input value={moodTags} disabled={saving} onChange={(event) => setMoodTags(event.target.value)} />
        </ReviewField>
        <PlaceReviewActions>
          <ToolbarButton type="button" disabled={saving} onClick={() => void onSave({ placeId: place.id, reviewStatus: "rejected", isActive: false })} $danger>
            거절
          </ToolbarButton>
          <ToolbarButton type="button" disabled={saving} onClick={() => void onSave({ placeId: place.id, reviewStatus: "approved", isActive: true })}>
            승인·노출
          </ToolbarButton>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "저장 중..." : "보정 저장"}
          </PrimaryButton>
        </PlaceReviewActions>
      </PlaceReviewForm>
    </PlaceReviewSection>
  );
}

function MetricRecords({
  metrics,
}: {
  metrics: TourismRegionMetricItem[];
}) {
  if (metrics.length === 0) {
    return <StatePanel>저장된 지역 지표가 없습니다.</StatePanel>;
  }

  return (
    <RecordList>
      {metrics.map((metric) => (
        <RecordCard key={metric.id}>
          <RecordHeader>
            <div>
              <h2>{metric.metricName}</h2>
              <p>
                {metric.areaName} {normalizeSigunguName(metric.sigunguName)} ·{" "}
                {formatBaseYm(metric.baseYm)}
              </p>
            </div>
            <MetricValue>{metric.metricValue ?? "-"}</MetricValue>
          </RecordHeader>
          <Metadata>
            {getMetricTypeLabel(metric.metricType)} · 코드 {metric.metricCode} ·
            동기화 {formatDate(metric.syncedAt)}
          </Metadata>
          <RawDetails payload={metric.rawPayload} />
        </RecordCard>
      ))}
    </RecordList>
  );
}

function SyncRuns({ runs }: { runs: ExternalDataSyncRunItem[] }) {
  if (runs.length === 0) {
    return <StatePanel>동기화 실행 기록이 없습니다.</StatePanel>;
  }

  return (
    <RecordList>
      {runs.map((run) => (
        <RecordCard key={run.id}>
          <RecordHeader>
            <div>
              <h2>{getSourceLabel(run.source)}</h2>
              <p>
                {run.operation} · {formatDate(run.startedAt)}
              </p>
            </div>
            <StatusBadge $tone={run.status}>
              {getRunStatusLabel(run.status)}
            </StatusBadge>
          </RecordHeader>
          <RunCounts>
            <span>수신 {run.receivedCount}</span>
            <span>추가 {run.createdCount}</span>
            <span>갱신 {run.updatedCount}</span>
            <span>제외 {run.skippedCount}</span>
            <span>실패 {run.failedCount}</span>
          </RunCounts>
          {run.errorMessage && <ErrorText>{run.errorMessage}</ErrorText>}
          <RawDetails payload={run.parameters} label="요청 조건" />
        </RecordCard>
      ))}
    </RecordList>
  );
}

function RawDetails({
  payload,
  label = "원본 JSON",
}: {
  payload: unknown;
  label?: string;
}) {
  return (
    <Details>
      <summary>{label}</summary>
      <pre>{JSON.stringify(payload, null, 2)}</pre>
    </Details>
  );
}

function normalizeTab(value: unknown): TourismDataTab {
  return value === "wellness" ||
    value === "municipalCore" ||
    value === "concentration" ||
    value === "visitors" ||
    value === "photos" ||
    value === "metrics" ||
    value === "runs"
    ? value
    : "places";
}

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "관광 데이터 요청을 처리하지 못했습니다.";
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function getPageRangeLabel({
  page,
  pageSize,
  totalItems,
}: TourismDataResponse["pagination"]) {
  if (totalItems === 0) return "0건";

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);
  return `${firstItem.toLocaleString("ko-KR")}–${lastItem.toLocaleString("ko-KR")}번째`;
}

function getVisiblePageNumbers(currentPage: number, totalPages: number) {
  const visibleCount = Math.min(5, totalPages);
  const firstPage = Math.min(
    Math.max(1, currentPage - Math.floor(visibleCount / 2)),
    totalPages - visibleCount + 1,
  );

  return Array.from(
    { length: visibleCount },
    (_, index) => firstPage + index,
  );
}

function formatBaseYm(value: string) {
  return value.length === 6
    ? `${value.slice(0, 4)}.${value.slice(4, 6)}`
    : value;
}

function formatBaseYmd(value: string) {
  return /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`
    : value;
}

function formatVisitorCount(value: string) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("ko-KR").format(number)
    : value;
}

function toDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeSigunguName(value: string) {
  return value === "_" ? "전체" : value;
}

function getPlaceContentTypeLabel(value: string | null) {
  if (value === "12") return "관광지";
  if (value === "14") return "문화시설";
  if (value === "25") return "여행코스";
  if (value === "28") return "레포츠";
  return value ? `유형 ${value}` : "미분류";
}

function getPlaceReviewTone(record: TourismPlaceSourceItem) {
  if (!record.linkedPlace) return "failed";
  return record.linkedPlace.reviewStatus;
}

function getPlaceReviewLabel(record: TourismPlaceSourceItem) {
  if (!record.linkedPlace) return "후보 정보 부족";
  const status = getPlaceReviewStatusLabel(record.linkedPlace.reviewStatus);
  return record.linkedPlace.isActive ? `${status} · 노출` : status;
}

function getPlaceReviewStatusLabel(
  status: "pending" | "approved" | "rejected",
) {
  if (status === "approved") return "승인";
  if (status === "rejected") return "거절";
  return "검토 대기";
}

function getMetricTypeLabel(value: string) {
  if (value === "serviceDemand") return "관광 서비스 수요";
  if (value === "culturalResourceDemand") return "문화 자원 수요";
  if (value === "stayIntensity") return "관광 체류 강도";
  if (value === "consumptionIntensity") return "관광 소비 강도";
  return value;
}

function getSourceLabel(value: string) {
  if (value === "ktoTourismInfo") return "국문 관광정보";
  if (value === "ktoWellnessTourism") return "웰니스 관광정보";
  if (value === "ktoMunicipalCoreTourism") {
    return "기초지자체 중심 관광지";
  }
  if (value === "ktoTouristSpotConcentrationRate") {
    return "관광지 집중률";
  }
  if (value === "ktoRegionalVisitorCount") {
    return "지역별 방문자 수";
  }
  if (value === "ktoTourismPhotoGallery") {
    return "관광사진 갤러리";
  }
  if (value === "ktoRegionalResourceDemand") {
    return "지역별 관광 자원 수요";
  }
  if (value === "ktoRegionalDemandIntensity") {
    return "지역별 관광 수요 강도";
  }
  return value;
}

function getWellnessThemeLabel(value: string | null) {
  return (
    wellnessThemeOptions.find(([code]) => code === value)?.[1] ??
    value ??
    "테마 미분류"
  );
}

function getRunStatusLabel(value: string) {
  if (value === "running") return "진행 중";
  if (value === "succeeded") return "완료";
  if (value === "partial") return "일부 실패";
  if (value === "failed") return "실패";
  return value;
}

const Page = styled.div`
  height: 100dvh;
  overflow-y: auto;
  background: var(--color-white);
  color: var(--color-text);
  -webkit-overflow-scrolling: touch;
`;

const Header = styled.header`
  position: sticky;
  z-index: 20;
  top: 0;
  border-bottom: 1px solid var(--color-brand-200);
  background: rgb(var(--color-white-rgb) / 0.9);
  backdrop-filter: blur(16px);
`;

const HeaderInner = styled.div`
  width: min(100%, 1280px);
  min-height: 80px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-8);
  margin: 0 auto;

  h1 {
    font-size: var(--font-size-600);
  }

  @media (max-width: 640px) {
    min-height: 68px;
    gap: var(--space-3);
    padding:
      max(var(--space-3), env(safe-area-inset-top))
      max(var(--space-4), env(safe-area-inset-right))
      var(--space-3)
      max(var(--space-4), env(safe-area-inset-left));

    h1 {
      font-size: var(--font-size-500);
    }
  }
`;

const BackLink = styled(Link)`
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--color-brand-100);
  color: var(--color-brand-1000);
  font-size: var(--font-size-800);
  line-height: 1;
`;

const Eyebrow = styled.span`
  display: block;
  color: var(--color-brand-800);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
`;

const RefreshButton = styled.button`
  min-height: 44px;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-brand-300);
  border-radius: 999px;
  background: var(--color-brand-100);
  color: var(--color-brand-1000);
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 700;
  cursor: pointer;

  @media (max-width: 480px) {
    width: 44px;
    overflow: hidden;
    padding: 0;
    font-size: 0;

    &::after {
      font-size: var(--font-size-300);
      content: "↻";
    }
  }
`;

const Content = styled.main`
  width: min(100%, 1280px);
  display: grid;
  gap: var(--space-6);
  padding: var(--space-8);
  margin: 0 auto;

  @media (max-width: 640px) {
    gap: var(--space-4);
    padding: var(--space-5) var(--space-4) var(--space-10);
  }
`;

const DesktopDataTools = styled.div`
  display: grid;
  gap: var(--space-6);

  @media (max-width: 640px) {
    display: none;
  }
`;

const MobileToolsButton = styled.button`
  display: none;

  @media (max-width: 640px) {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-1) var(--space-3);
    align-items: center;
    padding: var(--space-4);
    border: 1px solid var(--color-secondary-300);
    border-radius: var(--space-4);
    background: var(--color-secondary-100);
    color: var(--color-text);
    text-align: left;
    font: inherit;
    box-shadow: 0 8px 22px rgb(var(--color-black-rgb) / 0.04);

    span {
      font-size: var(--font-size-200);
      font-weight: 700;
    }

    small {
      overflow: hidden;
      grid-column: 1;
      color: var(--color-text-muted);
      font-size: var(--font-size-100);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    b {
      grid-column: 2;
      grid-row: 1 / span 2;
      color: var(--color-brand-900);
      font-size: var(--font-size-600);
      font-weight: 400;
    }
  }
`;

const MobileToolsBackdrop = styled.div<{
  $dragOffset: number;
  $dragging: boolean;
}>`
  position: fixed;
  z-index: 100;
  inset: 0;
  display: none;
  background: rgb(var(--color-black-rgb) / 0.32);

  @media (max-width: 640px) {
    display: flex;
    align-items: end;
    opacity: ${({ $dragOffset }) => Math.max(0.18, 1 - $dragOffset / 320)};
    transition: ${({ $dragging }) => ($dragging ? "none" : "opacity 240ms ease")};
  }
`;

const MobileToolsDrawer = styled.aside<{
  $dragOffset: number;
  $dragging: boolean;
}>`
  width: 100%;
  max-height: min(88dvh, 860px);
  overflow-y: auto;
  padding:
    var(--space-3)
    var(--space-5)
    max(var(--space-6), env(safe-area-inset-bottom));
  border-radius: var(--space-5) var(--space-5) 0 0;
  background: var(--color-white);
  box-shadow: 0 -18px 40px rgb(var(--color-black-rgb) / 0.16);
  transform: translateY(${({ $dragOffset }) => `${$dragOffset}px`});
  transition: ${({ $dragging }) =>
    $dragging ? "none" : "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)"};
  will-change: transform;

  > section {
    margin-top: var(--space-5);
  }
`;

const MobileToolsHandle = styled.button`
  width: 64px;
  height: 28px;
  display: grid;
  place-items: center;
  justify-self: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: grab;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }

  span {
    width: var(--space-10);
    height: var(--space-1);
    border-radius: 999px;
    background: var(--color-brand-500);
  }
`;

const MobileToolsHeader = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-4);

  span {
    color: var(--color-brand-800);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  h2 {
    margin-top: var(--space-1);
    font-size: var(--font-size-400);
  }
`;

const OverviewSection = styled.section`
  display: grid;
  gap: var(--space-4);
`;

const ConnectionList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
`;

const ConnectionBadge = styled.div<{ $configured: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: 999px;
  background: ${({ $configured }) =>
    $configured
      ? "var(--color-secondary-200)"
      : "var(--color-neutral-200)"};
  font-size: var(--font-size-100);
  font-weight: 600;

  > span {
    width: var(--space-2);
    height: var(--space-2);
    border-radius: 999px;
    background: ${({ $configured }) =>
      $configured
        ? "var(--color-success)"
        : "var(--color-neutral-600)"};
  }

  small {
    color: var(--color-text-muted);
  }
`;

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const MetricCard = styled.article`
  display: grid;
  gap: var(--space-2);
  padding: var(--space-5);
  border-radius: var(--space-4);
  background: var(--color-brand-100);
  box-shadow: 0 10px 28px rgb(var(--color-black-rgb) / 0.05);

  &:nth-of-type(even) {
    background: var(--color-secondary-100);
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  strong {
    font-size: var(--font-size-700);
  }

  @media (max-width: 480px) {
    padding: var(--space-4);
  }
`;

const LastSync = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const SyncSection = styled.section`
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-secondary-300);
  border-radius: var(--space-5);
  background: var(--color-secondary-100);
  box-shadow: 0 12px 30px rgb(var(--color-black-rgb) / 0.05);

  h2 {
    font-size: var(--font-size-400);
  }

  p {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const SyncForm = styled.form`
  display: grid;
  grid-template-columns: repeat(5, minmax(120px, 1fr)) auto;
  align-items: end;
  gap: var(--space-3);

  @media (max-width: 1000px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.label`
  min-width: 0;
  display: grid;
  gap: var(--space-1);

  > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 600;
  }
`;

const SyncHint = styled.p`
  align-self: end;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
`;

const Input = styled.input`
  width: 100%;
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  outline: 0;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;

  &:focus {
    border-color: var(--color-brand-600);
    box-shadow: 0 0 0 3px var(--color-brand-200);
  }
`;

const Select = styled.select`
  width: 100%;
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
`;

const PrimaryButton = styled.button`
  min-height: 44px;
  padding: 0 var(--space-5);
  border: 0;
  border-radius: var(--space-3);
  background: var(--color-brand-700);
  color: var(--color-white);
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

const Tabs = styled.nav`
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: var(--space-1);
  scroll-snap-type: x proximity;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (max-width: 640px) {
    margin: 0 calc(var(--space-4) * -1);
    padding: 0 var(--space-4) var(--space-1);
  }
`;

const TabButton = styled.button<{ $active: boolean }>`
  min-width: max-content;
  min-height: 44px;
  padding: 0 var(--space-5);
  border: 0;
  border-radius: 999px;
  background: ${({ $active }) =>
    $active ? "var(--color-brand-700)" : "var(--color-brand-100)"};
  color: ${({ $active }) =>
    $active ? "var(--color-white)" : "var(--color-text)"};
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 700;
  cursor: pointer;
  scroll-snap-align: start;

  @media (max-width: 640px) {
    min-height: 40px;
    padding: 0 var(--space-4);
  }
`;

const SearchForm = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);

  @media (max-width: 400px) {
    > button {
      padding: 0 var(--space-4);
    }
  }
`;

const PlaceExplorerHeader = styled.section`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-6);
  border: 1px solid var(--color-brand-200);
  border-radius: var(--space-5);
  background: var(--color-brand-100);
  box-shadow: 0 10px 28px rgb(var(--color-black-rgb) / 0.05);

  > div:first-of-type > span,
  h2,
  p {
    display: block;
  }

  > div:first-of-type > span {
    color: var(--color-brand-800);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  h2 {
    margin-top: var(--space-1);
    font-size: var(--font-size-500);
  }

  p {
    margin-top: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  @media (max-width: 720px) {
    align-items: stretch;
    flex-direction: column;
    padding: var(--space-5);
  }

  @media (max-width: 640px) {
    padding: var(--space-4);

    h2 {
      font-size: var(--font-size-400);
    }

    p {
      display: none;
    }
  }
`;

const PlaceFilterGroup = styled.div`
  display: flex;
  align-items: end;
  gap: var(--space-2);

  @media (max-width: 480px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const PlaceFilterLabel = styled.label`
  min-width: 150px;
  display: grid;
  gap: var(--space-1);

  > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 700;
  }

  @media (max-width: 480px) {
    min-width: 0;
  }
`;

const PlaceDataSummary = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 150px)) 1fr;
  align-items: center;
  gap: var(--space-3);

  @media (max-width: 720px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    gap: var(--space-2);
  }
`;

const PlaceSummaryItem = styled.div`
  display: grid;
  gap: var(--space-1);
  padding: var(--space-4);
  border-radius: var(--space-4);
  background: var(--color-secondary-100);

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  strong {
    font-size: var(--font-size-400);
  }

  @media (max-width: 640px) {
    gap: 0;
    padding: var(--space-3);
    border-radius: var(--space-3);

    span {
      overflow: hidden;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      font-size: var(--font-size-300);
    }
  }
`;

const PlaceSummaryHint = styled.p`
  justify-self: end;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);

  @media (max-width: 720px) {
    grid-column: 1 / -1;
    justify-self: start;
  }

  @media (max-width: 640px) {
    display: none;
  }
`;

const PlaceReviewToolbar = styled.section`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--space-4);
  background: var(--color-white);

  > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  > div {
    display: flex;
    flex-wrap: wrap;
    justify-content: end;
    gap: var(--space-2);
  }

  @media (max-width: 560px) {
    align-items: stretch;
    flex-direction: column;

    > div {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;

const ToolbarButton = styled.button<{ $danger?: boolean }>`
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid ${({ $danger }) =>
    $danger ? "var(--color-error)" : "var(--color-brand-300)"};
  border-radius: var(--space-3);
  background: ${({ $danger }) =>
    $danger ? "var(--color-white)" : "var(--color-brand-100)"};
  color: ${({ $danger }) =>
    $danger ? "var(--color-error)" : "var(--color-brand-1000)"};
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }
`;

const PlaceTable = styled.section`
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--space-5);
  background: var(--color-surface);
  box-shadow: 0 12px 30px rgb(var(--color-black-rgb) / 0.05);

  @media (max-width: 720px) {
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
`;

const PlaceTableHead = styled.div`
  display: grid;
  grid-template-columns: 40px minmax(130px, 0.9fr) minmax(240px, 2fr) 100px 130px minmax(150px, 0.9fr);
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-neutral-100);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  font-weight: 700;

  @media (max-width: 720px) {
    display: none;
  }
`;

const PlaceTableBody = styled.div`
  display: grid;

  @media (max-width: 720px) {
    gap: var(--space-2);
  }
`;

const PlaceTableRow = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);

  &:last-child {
    border-bottom: 0;
  }

  @media (max-width: 720px) {
    grid-template-columns: 32px minmax(0, 1fr);
    align-items: start;
    border: 1px solid var(--color-border);
    border-radius: var(--space-4);
    background: var(--color-surface);
    box-shadow: 0 6px 18px rgb(var(--color-black-rgb) / 0.04);
  }
`;

const PlaceSelectionControl = styled.label`
  height: 100%;
  display: grid;
  place-items: center;

  input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--color-brand-700);
    cursor: pointer;
  }

  input:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }
`;

const PlaceRowDetailButton = styled.button`
  width: 100%;
  display: grid;
  grid-template-columns: minmax(130px, 0.9fr) minmax(240px, 2fr) 100px 130px minmax(150px, 0.9fr);
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5) var(--space-4) 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: background 160ms ease;

  &:hover,
  &:focus-visible {
    outline: 0;
    background: var(--color-brand-100);
  }

  &:focus-visible {
    box-shadow: inset 0 0 0 2px var(--color-brand-600);
  }

  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-4) var(--space-4) var(--space-4) 0;
  }
`;

const PlaceTableCell = styled.div<{
  $column: "region" | "place" | "type" | "status" | "synced";
}>`
  min-width: 0;
  color: ${({ $column }) =>
    $column === "type" || $column === "synced"
      ? "var(--color-text-muted)"
      : "var(--color-text)"};
  font-size: var(--font-size-100);

  strong,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: var(--font-size-200);
  }

  small {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  @media (max-width: 720px) {
    ${({ $column }) =>
      $column === "region"
        ? "grid-column: 1; grid-row: 1;"
        : $column === "place"
          ? "grid-column: 1; grid-row: 2;"
          : $column === "status"
            ? "grid-column: 2; grid-row: 1;"
            : $column === "type"
              ? "grid-column: 2; grid-row: 2; align-self: end;"
              : "grid-column: 1 / -1; grid-row: 3;"}
  }
`;

const PlaceReviewSection = styled.section`
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  margin-bottom: var(--space-5);
  border: 1px solid var(--color-secondary-300);
  border-radius: var(--space-5);
  background: var(--color-secondary-100);
`;

const PlaceReviewHeader = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-3);

  span {
    color: var(--color-brand-800);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  h3 {
    margin-top: var(--space-1);
    font-size: var(--font-size-300);
  }
`;

const PlaceReviewForm = styled.form`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);

  @media (max-width: 380px) {
    grid-template-columns: 1fr;
  }
`;

const ReviewField = styled.label<{ $wide?: boolean }>`
  min-width: 0;
  display: grid;
  grid-column: ${({ $wide }) => ($wide ? "1 / -1" : "auto")};
  gap: var(--space-1);

  > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 700;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 112px;
  resize: vertical;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  outline: 0;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  line-height: var(--line-height-body);

  &:focus {
    border-color: var(--color-brand-600);
    box-shadow: 0 0 0 3px var(--color-brand-200);
  }
`;

const PlaceReviewActions = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: var(--space-2);

  @media (max-width: 420px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > :last-child {
      grid-column: 1 / -1;
    }
  }
`;

const PlaceReviewUnavailable = styled.p`
  padding: var(--space-4);
  margin-bottom: var(--space-5);
  border-radius: var(--space-4);
  background: var(--color-neutral-100);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
`;

const PlaceDrawerBackdrop = styled.div`
  position: fixed;
  z-index: 100;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: rgb(var(--color-black-rgb) / 0.32);
`;

const PlaceDrawer = styled.aside`
  width: min(100%, 480px);
  height: 100%;
  overflow-y: auto;
  padding: var(--space-7);
  background: var(--color-white);
  box-shadow: -18px 0 40px rgb(var(--color-black-rgb) / 0.16);

  @media (max-width: 640px) {
    width: 100%;
    height: min(82dvh, 760px);
    align-self: end;
    padding:
      var(--space-3)
      var(--space-5)
      max(var(--space-6), env(safe-area-inset-bottom));
    border-radius: var(--space-5) var(--space-5) 0 0;
    box-shadow: 0 -18px 40px rgb(var(--color-black-rgb) / 0.16);
  }
`;

const PlaceDrawerHandle = styled.div`
  width: 40px;
  height: 4px;
  display: none;
  margin: 0 auto var(--space-3);
  border-radius: 999px;
  background: var(--color-neutral-400);

  @media (max-width: 640px) {
    display: block;
  }
`;

const PlaceDrawerHeader = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-4);

  span {
    color: var(--color-brand-800);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  h2 {
    margin-top: var(--space-1);
    font-size: var(--font-size-500);
  }
`;

const DrawerCloseButton = styled.button`
  width: 40px;
  height: 40px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: var(--color-neutral-100);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-500);
  cursor: pointer;
`;

const PlaceDrawerStatus = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-5) 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const PlaceDetailGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-6);

  > div {
    min-height: 86px;
    display: grid;
    align-content: start;
    gap: var(--space-2);
    padding: var(--space-4);
    border-radius: var(--space-4);
    background: var(--color-brand-100);
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  strong {
    overflow-wrap: anywhere;
    font-size: var(--font-size-200);
  }

  @media (max-width: 380px) {
    grid-template-columns: 1fr;
  }
`;

const PaginationNav = styled.nav`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--space-4);
  background: var(--color-white);
  box-shadow: 0 8px 24px rgb(var(--color-black-rgb) / 0.04);

  @media (max-width: 640px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const PaginationSummary = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);

  @media (max-width: 640px) {
    text-align: center;
  }
`;

const PaginationControls = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
`;

const PaginationNumbers = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-1);
`;

const PaginationButton = styled.button`
  min-width: 60px;
  height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--space-3);
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 700;
  cursor: pointer;

  &:hover:not(:disabled),
  &:focus-visible {
    border-color: var(--color-brand-600);
    outline: 0;
    background: var(--color-brand-100);
  }

  &:disabled {
    color: var(--color-neutral-500);
    cursor: default;
  }

  @media (max-width: 480px) {
    min-width: 48px;
    padding: 0 var(--space-2);
  }
`;

const PaginationNumberButton = styled.button<{ $active: boolean }>`
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: var(--space-3);
  background: ${({ $active }) =>
    $active ? "var(--color-brand-700)" : "transparent"};
  color: ${({ $active }) =>
    $active ? "var(--color-white)" : "var(--color-text-muted)"};
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 700;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    outline: 0;
    background: ${({ $active }) =>
      $active ? "var(--color-brand-700)" : "var(--color-brand-100)"};
  }

  @media (max-width: 480px) {
    width: 36px;
    height: 36px;
  }
`;

const RecordList = styled.section`
  display: grid;
  gap: var(--space-3);
`;

const RecordCard = styled.article`
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--space-4);
  background: var(--color-surface);
  box-shadow: 0 10px 28px rgb(var(--color-black-rgb) / 0.05);

  &:nth-of-type(3n + 2) {
    border-color: var(--color-brand-200);
    background: var(--color-brand-100);
  }

  &:nth-of-type(3n) {
    border-color: var(--color-secondary-300);
    background: var(--color-secondary-100);
  }

  @media (max-width: 480px) {
    padding: var(--space-4);
    border: 0;
    border-radius: var(--space-5);
  }
`;

const RecordHeader = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-4);

  h2 {
    font-size: var(--font-size-300);
  }

  p {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const StatusBadge = styled.span<{ $tone: string }>`
  min-width: max-content;
  padding: var(--space-2) var(--space-3);
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "success" || $tone === "succeeded" || $tone === "approved"
      ? "var(--color-secondary-300)"
      : $tone === "failed" || $tone === "rejected"
        ? "var(--color-neutral-200)"
        : "var(--color-brand-200)"};
  color: ${({ $tone }) =>
    $tone === "failed" || $tone === "rejected"
      ? "var(--color-error)"
      : "var(--color-text)"};
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const MetricValue = styled.strong`
  color: var(--color-brand-900);
  font-size: var(--font-size-600);
`;

const PhotoLink = styled.a`
  flex: 0 0 auto;
  min-height: 36px;
  display: inline-grid;
  place-items: center;
  padding: 0 var(--space-3);
  border-radius: 999px;
  background: var(--color-brand-100);
  color: var(--color-brand-1000);
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const Metadata = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const RunCounts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);

  span {
    padding: var(--space-1) var(--space-2);
    border-radius: var(--space-2);
    background: var(--color-white);
    font-size: var(--font-size-100);
  }
`;

const ErrorText = styled.p`
  color: var(--color-error);
  font-size: var(--font-size-100);
`;

const Details = styled.details`
  summary {
    color: var(--color-brand-900);
    font-size: var(--font-size-100);
    font-weight: 700;
    cursor: pointer;
  }

  pre {
    max-height: 360px;
    overflow: auto;
    padding: var(--space-4);
    margin: var(--space-2) 0 0;
    border-radius: var(--space-3);
    background: var(--color-neutral-1200);
    color: var(--color-neutral-200);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
`;

const StatePanel = styled.div`
  min-height: 220px;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  border-radius: var(--space-5);
  background: var(--color-neutral-100);
  color: var(--color-text-muted);
  box-shadow: 0 10px 28px rgb(var(--color-black-rgb) / 0.05);
`;

const ErrorNotice = styled.div`
  padding: var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--space-3);
  color: var(--color-error);
`;

const SuccessNotice = styled.div`
  padding: var(--space-4);
  border-radius: var(--space-3);
  background: var(--color-secondary-200);
  color: var(--color-text);
  font-weight: 700;
`;

const AccessPage = styled.main`
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--space-5);
  background: var(--color-white);
`;

const AccessCard = styled.section`
  width: min(100%, 420px);
  display: grid;
  gap: var(--space-4);
  padding: var(--space-8);
  border-radius: var(--space-5);
  background: var(--color-brand-100);
  box-shadow: 0 16px 40px rgb(var(--color-black-rgb) / 0.08);

  h1 {
    font-size: var(--font-size-500);
  }

  p {
    color: var(--color-text-muted);
  }
`;

const PrimaryLink = styled(Link)`
  min-height: 44px;
  display: grid;
  place-items: center;
  border-radius: var(--space-3);
  background: var(--color-brand-700);
  color: var(--color-white);
  font-weight: 700;
`;
