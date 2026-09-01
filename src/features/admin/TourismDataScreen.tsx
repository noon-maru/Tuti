"use client";

import styled from "@emotion/styled";
import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
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
  RelatedTourismSourceItem,
  TouristSpotConcentrationRateItem,
  RegionalVisitorCountItem,
  TourismPhotoGallerySourceItem,
} from "@/shared/api/tourismAdmin";
import { tourApiSidoOptions } from "@/shared/tourism/tourApiRegions";

type SyncSource =
  | "places"
  | "wellness"
  | "municipalCore"
  | "related"
  | "concentration"
  | "visitorMetropolitan"
  | "visitorMunicipal"
  | "photos"
  | "serviceDemand"
  | "culturalResourceDemand"
  | "stayIntensity"
  | "consumptionIntensity";

export type TourismWorkspaceMode = "overview" | "explorer" | "runs";

const workspaceModes: Array<{
  id: TourismWorkspaceMode;
  label: string;
  description: string;
}> = [
  {
    id: "overview",
    label: "현황",
    description: "수집 범위와 혼잡도 적용 상태",
  },
  {
    id: "explorer",
    label: "데이터 탐색",
    description: "원본과 지역 지표 비교",
  },
  {
    id: "runs",
    label: "실행 기록",
    description: "동기화 결과와 오류 추적",
  },
];

const tabs: Array<{ id: TourismDataTab; label: string }> = [
  { id: "places", label: "장소 원본" },
  { id: "wellness", label: "웰니스 원본" },
  { id: "municipalCore", label: "중심 관광지" },
  { id: "related", label: "연관 관광지" },
  { id: "concentration", label: "집중률" },
  { id: "visitors", label: "방문자 수" },
  { id: "photos", label: "관광사진" },
  { id: "metrics", label: "지역 지표" },
  { id: "runs", label: "동기화 기록" },
];

const datasetTabs = tabs.filter(
  (item): item is { id: Exclude<TourismDataTab, "runs">; label: string } =>
    item.id !== "runs",
);

const datasetDescriptions: Record<
  TourismDataTab,
  { title: string; description: string }
> = {
  places: {
    title: "관광지 원천 데이터",
    description: "추천 후보가 되는 장소 원본과 검수 연결 상태를 확인합니다.",
  },
  wellness: {
    title: "웰니스 관광 원천",
    description: "테마별 웰니스 관광지와 원본 응답을 확인합니다.",
  },
  municipalCore: {
    title: "기초지자체 중심 관광지",
    description: "월별·시군구별 주요 관광지 순위와 분류를 확인합니다.",
  },
  related: {
    title: "관광지별 연관 관광지",
    description: "중심 관광지와 함께 차량으로 방문된 장소와 연계 순위를 확인합니다.",
  },
  concentration: {
    title: "관광지 집중률",
    description: "날짜와 지역에 따른 관광지 방문 집중도를 확인합니다.",
  },
  visitors: {
    title: "지역별 방문자 수",
    description: "광역·기초지자체별 방문자 규모와 유형을 확인합니다.",
  },
  photos: {
    title: "관광사진 메타데이터",
    description: "사진 미리보기와 촬영지·촬영자·검색 키워드를 확인합니다.",
  },
  metrics: {
    title: "지역 관광 지표",
    description: "관광 자원 수요와 체류·소비 강도를 월별로 확인합니다.",
  },
  runs: {
    title: "동기화 실행 기록",
    description: "공공데이터 요청 결과와 오류·요청 조건을 추적합니다.",
  },
};

const sourceOptions: Array<{ value: SyncSource; label: string }> = [
  { value: "places", label: "국문 관광정보" },
  { value: "wellness", label: "웰니스 관광정보" },
  { value: "municipalCore", label: "기초지자체 중심 관광지" },
  { value: "related", label: "관광지별 연관 관광지" },
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
      | "related"
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
  initialMode,
}: {
  initialTab: TourismDataTab;
  initialMode: TourismWorkspaceMode;
}) {
  const [tab, setTab] = useState(initialTab);
  const [mode, setMode] = useState<TourismWorkspaceMode>(initialMode);
  const [lastDatasetTab, setLastDatasetTab] = useState<
    Exclude<TourismDataTab, "runs">
  >(initialTab === "runs" ? "places" : initialTab);
  const [data, setData] = useState<TourismDataResponse | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [placeSido, setPlaceSido] = useState("");
  const [placeSigungu, setPlaceSigungu] = useState("");
  const [metricType, setMetricType] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reviewingPlaces, setReviewingPlaces] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<number | null>(null);

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
    if (tab === "metrics" && metricType) {
      searchParams.set("metricType", metricType);
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
  }, [appliedQuery, metricType, page, placeSido, placeSigungu, tab]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location.href);
      const nextTab = normalizeTab(url.searchParams.get("tab"));
      setPage(1);
      setTab(nextTab);
      setMode(normalizeWorkspaceMode(url.searchParams.get("view"), nextTab));
      if (nextTab !== "runs") setLastDatasetTab(nextTab);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const changeTab = (nextTab: TourismDataTab) => {
    setTab(nextTab);
    setMode(nextTab === "runs" ? "runs" : "explorer");
    if (nextTab !== "runs") setLastDatasetTab(nextTab);
    setQuery("");
    setAppliedQuery("");
    setPlaceSido("");
    setPlaceSigungu("");
    setMetricType("");
    setPage(1);
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    url.searchParams.set("view", nextTab === "runs" ? "runs" : "explorer");
    window.history.pushState({}, "", url);
  };

  const changeMode = (nextMode: TourismWorkspaceMode) => {
    const nextTab =
      nextMode === "runs"
        ? "runs"
        : tab === "runs"
          ? lastDatasetTab
          : tab;

    setMode(nextMode);
    setTab(nextTab);
    setQuery("");
    setAppliedQuery("");
    setPage(1);
    setError(null);

    const url = new URL(window.location.href);
    url.searchParams.set("view", nextMode);
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
            <h1>관광 데이터</h1>
          </div>
          <RefreshButton type="button" onClick={() => void load()}>
            새로고침
          </RefreshButton>
        </HeaderInner>
      </Header>

      <Content>
        <WorkspaceNav aria-label="관광 데이터 작업 모드">
          {workspaceModes.map((item) => (
            <WorkspaceNavButton
              key={item.id}
              type="button"
              $active={mode === item.id}
              aria-current={mode === item.id ? "page" : undefined}
              onClick={() => changeMode(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </WorkspaceNavButton>
          ))}
        </WorkspaceNav>

        {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
        {notice && <SuccessNotice role="status">{notice}</SuccessNotice>}

        {mode === "overview" ? (
          loading && !data ? (
            <StatePanel>관광 데이터 현황을 불러오고 있어요.</StatePanel>
          ) : data ? (
            <OverviewWorkspace>
              <Overview overview={data.overview} />
              <CrowdCoverageDashboard coverage={data.overview.crowdCoverage} />
              <CollectionDashboard
                progress={data.overview.collectionProgress}
                lastSyncedAt={data.overview.lastSyncedAt}
              />
              <SyncPanel syncing={syncing} onSync={sync} />
            </OverviewWorkspace>
          ) : (
            <StatePanel>표시할 관광 데이터 현황이 없습니다.</StatePanel>
          )
        ) : (
          <ExplorerWorkspace>
            {mode === "explorer" && (
              <DatasetTabs aria-label="관광 데이터셋 선택">
                {datasetTabs.map((item) => (
                  <DatasetTabButton
                    key={item.id}
                    type="button"
                    $active={tab === item.id}
                    aria-pressed={tab === item.id}
                    onClick={() => changeTab(item.id)}
                  >
                    {item.label}
                  </DatasetTabButton>
                ))}
              </DatasetTabs>
            )}

            <SearchForm
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setAppliedQuery(query.trim());
              }}
            >
              <Input
                value={query}
                aria-label={`${mode === "runs" ? "동기화 실행 기록" : datasetDescriptions[tab].title} 검색`}
                placeholder={getSearchPlaceholder(mode === "runs" ? "runs" : tab)}
                onChange={(event) => setQuery(event.target.value)}
              />
              <PrimaryButton type="submit">검색</PrimaryButton>
            </SearchForm>

            {!loading && data && (mode === "runs" || tab !== "places") && (
              <DatasetExplorerHeader
                tab={mode === "runs" ? "runs" : tab}
                pagination={data.pagination}
                metricType={metricType}
                onMetricTypeChange={(value) => {
                  setPage(1);
                  setMetricType(value);
                }}
              />
            )}

            {loading ? (
              <StatePanel>관광 데이터를 불러오고 있어요.</StatePanel>
            ) : mode === "runs" ? (
              <SyncRuns runs={data?.runs ?? []} />
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
            ) : tab === "related" ? (
              <RelatedTourismRecords records={data?.related ?? []} />
            ) : tab === "concentration" ? (
              <ConcentrationRecords records={data?.concentration ?? []} />
            ) : tab === "visitors" ? (
              <VisitorRecords records={data?.visitors ?? []} />
            ) : tab === "photos" ? (
              <PhotoRecords records={data?.photos ?? []} />
            ) : (
              <MetricRecords metrics={data?.metrics ?? []} />
            )}

            {!loading && data && data.pagination.totalPages > 1 && (
              <DataPagination
                pagination={data.pagination}
                onPageChange={setPage}
              />
            )}
          </ExplorerWorkspace>
        )}
      </Content>
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
    ["연관 관광지", overview.relatedTourismSourceRecords],
    ["집중률 원본", overview.touristSpotConcentrationRecords],
    ["방문자 수", overview.regionalVisitorCountRecords],
    ["관광사진", overview.tourismPhotoGalleryRecords],
    ["지역 지표", overview.regionalMetrics],
    ["동기화 실행", overview.syncRuns],
    ["실패 이력", overview.failedRuns],
  ];
  const connectionConfigured = overview.connections.every(
    (connection) => connection.configured,
  );

  return (
    <OverviewSection>
      <SectionHeading>
        <div>
          <h2>저장 데이터</h2>
          <p>데이터셋별 누적 레코드와 실행 이력을 확인합니다.</p>
        </div>
        <ConnectionSummary $configured={connectionConfigured}>
          <span aria-hidden="true" />
          <div>
            <strong>공공데이터포털 인증 키</strong>
            <small>{connectionConfigured ? "설정됨" : "확인 필요"}</small>
          </div>
        </ConnectionSummary>
      </SectionHeading>
      <InventoryTable>
        <thead>
          <tr>
            <th scope="col">데이터셋</th>
            <th scope="col">저장 건수</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{Number(value).toLocaleString("ko-KR")}</td>
            </tr>
          ))}
        </tbody>
      </InventoryTable>
      <LastSync>
        마지막 동기화{" "}
        <strong>
          {overview.lastSyncedAt
            ? formatDate(overview.lastSyncedAt)
            : "기록 없음"}
        </strong>
      </LastSync>
    </OverviewSection>
  );
}

function CollectionDashboard({
  progress,
  lastSyncedAt,
}: {
  progress: TourismDataResponse["overview"]["collectionProgress"];
  lastSyncedAt: string | null;
}) {
  const completedDatasets = progress.filter(
    (item) => item.status === "complete",
  ).length;
  const pendingJobs = progress.reduce(
    (sum, item) => sum + (item.remainingJobs ?? 0),
    0,
  );
  const attentionDatasets = progress.filter(
    (item) => item.status === "quota_wait" || item.status === "error",
  ).length;

  return (
    <CollectionSection>
      <CollectionHeader>
        <div>
          <Eyebrow>수집 상태</Eyebrow>
          <h2>공공데이터 수집 현황</h2>
          <p>
            성공 체크포인트를 기준으로 완료 범위와 다음 이어받기 상태를
            계산합니다.
          </p>
        </div>
        <CollectionHeadline>
          <strong>
            {completedDatasets}/{progress.length}
          </strong>
          <span>데이터셋 완료</span>
        </CollectionHeadline>
      </CollectionHeader>

      <CollectionSummary>
        <span>
          남은 작업 <strong>{pendingJobs.toLocaleString("ko-KR")}건</strong>
        </span>
        <span>
          확인할 상태 <strong>{attentionDatasets.toLocaleString("ko-KR")}곳</strong>
        </span>
        <span>
          마지막 실행{" "}
          <strong>{lastSyncedAt ? formatDate(lastSyncedAt) : "기록 없음"}</strong>
        </span>
      </CollectionSummary>

      <CollectionTableFrame>
        <CollectionTable>
          <thead>
            <tr>
              <th scope="col">데이터셋</th>
              <th scope="col">상태</th>
              <th scope="col">진행</th>
              <th scope="col">저장</th>
              <th scope="col">남은 작업</th>
              <th scope="col">실패</th>
              <th scope="col">최근 결과</th>
            </tr>
          </thead>
          <tbody>
            {progress.map((item) => (
              <tr key={item.id}>
                <th scope="row">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </th>
                <td data-label="상태">
                  <CollectionStatus $status={item.status}>
                    {getCollectionStatusLabel(item.status)}
                  </CollectionStatus>
                </td>
                <td data-label="진행">
                  {item.progressPercent === null ? (
                    <TableMuted>범위 없음</TableMuted>
                  ) : (
                    <InlineProgress>
                      <span>{item.progressPercent.toLocaleString("ko-KR")}%</span>
                      <CollectionProgressTrack aria-hidden="true">
                        <CollectionProgressBar
                          $progress={item.progressPercent}
                          $status={item.status}
                        />
                      </CollectionProgressTrack>
                    </InlineProgress>
                  )}
                </td>
                <td data-label="저장" data-numeric="true">
                  {item.storedRecords.toLocaleString("ko-KR")}
                </td>
                <td data-label="남은 작업" data-numeric="true">
                  {item.remainingJobs === null
                    ? "-"
                    : item.remainingJobs.toLocaleString("ko-KR")}
                </td>
                <td data-label="실패" data-numeric="true">
                  {item.unresolvedFailures.toLocaleString("ko-KR")}
                </td>
                <td data-label="최근 결과">
                  {item.lastError ? (
                    <CollectionError title={item.lastError}>
                      {getCollectionErrorLabel(item.lastError)}
                    </CollectionError>
                  ) : (
                    <TableMuted>
                      {item.lastSuccessAt
                        ? formatDate(item.lastSuccessAt)
                        : "수집 기록 없음"}
                    </TableMuted>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </CollectionTable>
      </CollectionTableFrame>

      <CollectionNotice>
        <span />
        HTTP 429는 일일 호출 한도 대기 상태입니다. 다음 실행에서는 완료된
        작업을 건너뛰고 남은 작업만 이어받습니다.
      </CollectionNotice>
    </CollectionSection>
  );
}

function CrowdCoverageDashboard({
  coverage,
}: {
  coverage: TourismDataResponse["overview"]["crowdCoverage"];
}) {
  const tiers = [
    {
      id: "realtime",
      label: "실시간 연결",
      value: coverage.realtimePlaces,
      description: "서울 도시데이터 연결 대상",
    },
    {
      id: "forecast",
      label: "관광공사 예상",
      value: coverage.ktoForecastPlaces,
      description: "실시간 제외 후 집중률 적용",
    },
    {
      id: "estimate",
      label: "Tuti 예상",
      value: coverage.tutiEstimatePlaces,
      description: "앞선 계층 제외 후 자체 추정",
    },
    {
      id: "unavailable",
      label: "정보 없음",
      value: coverage.unavailablePlaces,
      description: "세 계층 모두 미적용",
    },
  ] as const;

  return (
    <CrowdCoverageSection>
      <CrowdCoverageHeader>
        <div>
          <Eyebrow>혼잡도 적용</Eyebrow>
          <h2>추천풀 혼잡도 적용 현황</h2>
          <p>
            한 장소를 실시간, 관광공사 예상, Tuti 예상 순서로 한 계층에만
            집계합니다.
          </p>
        </div>
        <CrowdCoverageHeadline>
          <strong>{coverage.coveragePercent.toLocaleString("ko-KR")}%</strong>
          <span>
            {coverage.coveredPlaces.toLocaleString("ko-KR")} /{" "}
            {coverage.totalPlaces.toLocaleString("ko-KR")}곳
          </span>
        </CrowdCoverageHeadline>
      </CrowdCoverageHeader>

      <CrowdCoverageBar
        role="img"
        aria-label={`추천풀 ${coverage.totalPlaces}곳 중 혼잡도 적용 ${coverage.coveredPlaces}곳, 정보 없음 ${coverage.unavailablePlaces}곳`}
      >
        {tiers.map((tier) => (
          <CrowdCoverageSegment
            key={tier.id}
            data-tone={tier.id}
            style={{
              width: `${percentageOf(tier.value, coverage.totalPlaces)}%`,
            }}
          />
        ))}
      </CrowdCoverageBar>

      <CrowdLegend>
        <thead>
          <tr>
            <th scope="col">적용 계층</th>
            <th scope="col">장소</th>
            <th scope="col">비중</th>
            <th scope="col">적용 기준</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier) => (
            <tr key={tier.id} data-tone={tier.id}>
              <th scope="row">
                <span aria-hidden="true" />
                {tier.label}
              </th>
              <td data-numeric="true">
                {tier.value.toLocaleString("ko-KR")}곳
              </td>
              <td data-numeric="true">
                {percentageOf(tier.value, coverage.totalPlaces).toFixed(1)}%
              </td>
              <td>{tier.description}</td>
            </tr>
          ))}
        </tbody>
      </CrowdLegend>

      <CrowdCoverageMeta>
        <span>
          관광공사 집중률 갱신 {coverage.concentrationSyncedAt
            ? formatDate(coverage.concentrationSyncedAt)
            : "기록 없음"}
        </span>
        <span>
          Tuti 예상 계산 {coverage.estimateCalculatedAt
            ? formatDate(coverage.estimateCalculatedAt)
            : "기록 없음"}
        </span>
      </CrowdCoverageMeta>
      <CrowdCoverageNote>
        실시간 연결은 서울 도시데이터 조회가 가능한 장소 매핑을 뜻합니다.
        일시적인 API 장애가 발생하면 다음 예상 계층으로 자동 전환됩니다.
      </CrowdCoverageNote>
    </CrowdCoverageSection>
  );
}

function percentageOf(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function DatasetExplorerHeader({
  tab,
  pagination,
  metricType,
  onMetricTypeChange,
}: {
  tab: TourismDataTab;
  pagination: TourismDataResponse["pagination"];
  metricType: string;
  onMetricTypeChange: (value: string) => void;
}) {
  const metadata = datasetDescriptions[tab];

  return (
    <DatasetHeader>
      <div>
        <h2>{metadata.title}</h2>
        <p>{metadata.description}</p>
      </div>
      <DatasetHeaderSide>
        {tab === "metrics" && (
          <DatasetFilter>
            <span>지표 유형</span>
            <Select
              value={metricType}
              onChange={(event) => onMetricTypeChange(event.target.value)}
            >
              <option value="">전체 지표</option>
              <option value="serviceDemand">관광 서비스 수요</option>
              <option value="culturalResourceDemand">문화·자연 자원 수요</option>
              <option value="stayIntensity">관광 체류 강도</option>
              <option value="consumptionIntensity">관광 소비 강도</option>
            </Select>
          </DatasetFilter>
        )}
        <DatasetHeaderStats>
          <div>
            <span>검색 결과</span>
            <strong>{pagination.totalItems.toLocaleString("ko-KR")}건</strong>
          </div>
          <div>
            <span>현재 범위</span>
            <strong>{getPageRangeLabel(pagination)}</strong>
          </div>
        </DatasetHeaderStats>
      </DatasetHeaderSide>
    </DatasetHeader>
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
  const [baseMonth, setBaseMonth] = useState(getPreviousMonthInputValue);
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
      source === "related" ||
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
    } else if (nextSource === "related") {
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
                  : source === "related"
                    ? {
                        kind: "related",
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
        ) : source === "municipalCore" || source === "related" ? (
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
            (source === "related" &&
              (!baseMonth || !municipalSigunguCode)) ||
            (source === "concentration" && !municipalSigunguCode) ||
            ((source === "visitorMetropolitan" ||
              source === "visitorMunicipal") &&
              !visitorDate) ||
            (source !== "places" &&
              source !== "wellness" &&
              source !== "municipalCore" &&
              source !== "related" &&
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

type RecordTableColumn = {
  key: string;
  label: string;
  numeric?: boolean;
  mobile: "primary" | "secondary" | "value" | "hide";
};

type RecordTableRow = {
  id: string;
  title: string;
  subtitle: string;
  cells: Record<string, ReactNode>;
  details: Array<{ label: string; value: ReactNode }>;
  rawPayload: unknown;
  rawLabel?: string;
};

function RecordDataTable({
  label,
  columns,
  rows,
  emptyMessage,
}: {
  label: string;
  columns: RecordTableColumn[];
  rows: RecordTableRow[];
  emptyMessage: string;
}) {
  const [selectedRow, setSelectedRow] = useState<RecordTableRow | null>(null);

  useEffect(() => {
    if (!selectedRow) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRow(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRow]);

  if (rows.length === 0) return <StatePanel>{emptyMessage}</StatePanel>;

  return (
    <>
      <RecordTableFrame>
        <RecordTable aria-label={label}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  data-numeric={column.numeric || undefined}
                >
                  {column.label}
                </th>
              ))}
              <th scope="col">상세</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-mobile={column.mobile}
                    data-numeric={column.numeric || undefined}
                  >
                    {column.mobile === "primary" ? (
                      <PrimaryCellButton
                        type="button"
                        aria-label={`${row.title} 상세 보기`}
                        onClick={() => setSelectedRow(row)}
                      >
                        {row.cells[column.key]}
                      </PrimaryCellButton>
                    ) : (
                      row.cells[column.key]
                    )}
                  </td>
                ))}
                <td data-mobile="action">
                  <RowDetailButton
                    type="button"
                    aria-label={`${row.title} 상세 보기`}
                    onClick={() => setSelectedRow(row)}
                  >
                    상세
                  </RowDetailButton>
                </td>
              </tr>
            ))}
          </tbody>
        </RecordTable>
      </RecordTableFrame>

      {selectedRow && (
        <PlaceDrawerBackdrop
          role="presentation"
          onMouseDown={() => setSelectedRow(null)}
        >
          <PlaceDrawer
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <PlaceDrawerHandle />
            <PlaceDrawerHeader>
              <div>
                <span>원본 레코드</span>
                <h2 id="record-detail-title">{selectedRow.title}</h2>
                <p>{selectedRow.subtitle}</p>
              </div>
              <DrawerCloseButton
                type="button"
                autoFocus
                aria-label="상세 닫기"
                onClick={() => setSelectedRow(null)}
              >
                ×
              </DrawerCloseButton>
            </PlaceDrawerHeader>
            <RecordDetailGrid>
              {selectedRow.details.map((detail) => (
                <div key={detail.label}>
                  <span>{detail.label}</span>
                  <strong>{detail.value}</strong>
                </div>
              ))}
            </RecordDetailGrid>
            <RawDetails
              payload={selectedRow.rawPayload}
              label={selectedRow.rawLabel}
            />
          </PlaceDrawer>
        </PlaceDrawerBackdrop>
      )}
    </>
  );
}

function MunicipalCoreRecords({
  records,
}: {
  records: MunicipalCoreTourismSourceItem[];
}) {
  return (
    <RecordDataTable
      label="기초지자체 중심 관광지 목록"
      emptyMessage="저장된 중심 관광지 원본이 없습니다."
      columns={[
        { key: "baseYm", label: "기준월", mobile: "hide" },
        { key: "region", label: "지역", mobile: "secondary" },
        { key: "rank", label: "순위", numeric: true, mobile: "value" },
        { key: "place", label: "관광지", mobile: "primary" },
        { key: "category", label: "분류", mobile: "hide" },
        { key: "code", label: "코드", mobile: "hide" },
        { key: "syncedAt", label: "동기화", mobile: "hide" },
      ]}
      rows={records.map((record) => {
        const region = `${record.areaName} ${record.sigunguName}`;
        const category = [record.categoryLargeName, record.categoryMediumName]
          .filter(Boolean)
          .join(" · ") || "분류 없음";

        return {
          id: record.id,
          title: record.touristSpotName,
          subtitle: `${region} · ${formatBaseYm(record.baseYm)}`,
          cells: {
            baseYm: formatBaseYm(record.baseYm),
            region,
            rank: `#${record.rank}`,
            place: <TablePrimary>{record.touristSpotName}</TablePrimary>,
            category,
            code: <CodeText>{record.touristSpotCode}</CodeText>,
            syncedAt: formatDate(record.syncedAt),
          },
          details: [
            { label: "기준월", value: formatBaseYm(record.baseYm) },
            { label: "지역", value: region },
            { label: "순위", value: `#${record.rank}` },
            { label: "분류", value: category },
            { label: "관광지 코드", value: record.touristSpotCode },
            { label: "동기화", value: formatDate(record.syncedAt) },
          ],
          rawPayload: record.rawPayload,
        };
      })}
    />
  );
}

function RelatedTourismRecords({
  records,
}: {
  records: RelatedTourismSourceItem[];
}) {
  return (
    <RecordDataTable
      label="관광지별 연관 관광지 목록"
      emptyMessage="저장된 연관 관광지 원본이 없습니다."
      columns={[
        { key: "baseYm", label: "기준월", mobile: "hide" },
        { key: "origin", label: "출발 관광지", mobile: "primary" },
        { key: "related", label: "연관 관광지", mobile: "secondary" },
        { key: "region", label: "도착 지역", mobile: "hide" },
        { key: "rank", label: "순위", numeric: true, mobile: "value" },
        { key: "category", label: "분류", mobile: "hide" },
        { key: "syncedAt", label: "동기화", mobile: "hide" },
      ]}
      rows={records.map((record) => {
        const originRegion = `${record.areaName} ${record.sigunguName}`;
        const relatedRegion = `${record.relatedAreaName} ${record.relatedSigunguName}`;
        const category = [
          record.relatedCategoryLargeName,
          record.relatedCategoryMediumName,
          record.relatedCategorySmallName,
        ].filter(Boolean).join(" · ") || "분류 없음";

        return {
          id: record.id,
          title: `${record.touristSpotName} → ${record.relatedTouristSpotName}`,
          subtitle: `${originRegion}에서 출발 · ${formatBaseYm(record.baseYm)}`,
          cells: {
            baseYm: formatBaseYm(record.baseYm),
            origin: <TablePrimary>{record.touristSpotName}</TablePrimary>,
            related: record.relatedTouristSpotName,
            region: relatedRegion,
            rank: `#${record.rank}`,
            category,
            syncedAt: formatDate(record.syncedAt),
          },
          details: [
            { label: "기준월", value: formatBaseYm(record.baseYm) },
            { label: "출발 관광지", value: record.touristSpotName },
            { label: "출발 지역", value: originRegion },
            { label: "연관 관광지", value: record.relatedTouristSpotName },
            { label: "도착 지역", value: relatedRegion },
            { label: "연관 순위", value: `#${record.rank}` },
            { label: "분류", value: category },
            { label: "동기화", value: formatDate(record.syncedAt) },
          ],
          rawPayload: record.rawPayload,
        };
      })}
    />
  );
}

function ConcentrationRecords({
  records,
}: {
  records: TouristSpotConcentrationRateItem[];
}) {
  return (
    <RecordDataTable
      label="관광지 집중률 목록"
      emptyMessage="저장된 관광지 집중률 원본이 없습니다."
      columns={[
        { key: "baseYmd", label: "기준일", mobile: "hide" },
        { key: "region", label: "지역", mobile: "secondary" },
        { key: "place", label: "관광지", mobile: "primary" },
        { key: "rate", label: "집중률", numeric: true, mobile: "value" },
        { key: "syncedAt", label: "동기화", mobile: "hide" },
      ]}
      rows={records.map((record) => {
        const region = `${record.areaName} ${record.sigunguName}`;
        return {
          id: record.id,
          title: record.touristSpotName,
          subtitle: `${region} · ${formatBaseYmd(record.baseYmd)}`,
          cells: {
            baseYmd: formatBaseYmd(record.baseYmd),
            region,
            place: <TablePrimary>{record.touristSpotName}</TablePrimary>,
            rate: <TableMetric>{record.concentrationRate}%</TableMetric>,
            syncedAt: formatDate(record.syncedAt),
          },
          details: [
            { label: "기준일", value: formatBaseYmd(record.baseYmd) },
            { label: "지역", value: region },
            { label: "집중률", value: `${record.concentrationRate}%` },
            { label: "동기화", value: formatDate(record.syncedAt) },
          ],
          rawPayload: record.rawPayload,
        };
      })}
    />
  );
}

function VisitorRecords({
  records,
}: {
  records: RegionalVisitorCountItem[];
}) {
  return (
    <RecordDataTable
      label="지역별 방문자 수 목록"
      emptyMessage="저장된 지역별 방문자 수 원본이 없습니다."
      columns={[
        { key: "baseYmd", label: "기준일", mobile: "hide" },
        { key: "level", label: "구분", mobile: "hide" },
        { key: "region", label: "지역", mobile: "primary" },
        { key: "type", label: "방문자 유형", mobile: "secondary" },
        { key: "count", label: "방문자 수", numeric: true, mobile: "value" },
        { key: "syncedAt", label: "동기화", mobile: "hide" },
      ]}
      rows={records.map((record) => {
        const level = record.aggregationLevel === "metropolitan"
          ? "광역 지자체"
          : "기초 지자체";
        return {
          id: record.id,
          title: record.regionName,
          subtitle: `${level} · ${formatBaseYmd(record.baseYmd)} · ${record.weekdayName}`,
          cells: {
            baseYmd: formatBaseYmd(record.baseYmd),
            level,
            region: <TablePrimary>{record.regionName}</TablePrimary>,
            type: record.visitorTypeName,
            count: <TableMetric>{formatVisitorCount(record.visitorCount)}</TableMetric>,
            syncedAt: formatDate(record.syncedAt),
          },
          details: [
            { label: "기준일", value: formatBaseYmd(record.baseYmd) },
            { label: "구분", value: level },
            { label: "지역", value: record.regionName },
            { label: "지역 코드", value: record.regionCode },
            { label: "요일", value: record.weekdayName },
            { label: "방문자 유형", value: record.visitorTypeName },
            { label: "방문자 수", value: `${formatVisitorCount(record.visitorCount)}명` },
            { label: "동기화", value: formatDate(record.syncedAt) },
          ],
          rawPayload: record.rawPayload,
        };
      })}
    />
  );
}

function PhotoRecords({
  records,
}: {
  records: TourismPhotoGallerySourceItem[];
}) {
  return (
    <RecordDataTable
      label="관광사진 메타데이터 목록"
      emptyMessage="저장된 관광사진 원본이 없습니다."
      columns={[
        { key: "preview", label: "미리보기", mobile: "hide" },
        { key: "title", label: "사진", mobile: "primary" },
        { key: "location", label: "촬영지 · 월", mobile: "secondary" },
        { key: "photographer", label: "촬영자", mobile: "hide" },
        { key: "contentId", label: "콘텐츠 ID", mobile: "hide" },
        { key: "syncedAt", label: "동기화", mobile: "hide" },
      ]}
      rows={records.map((record) => {
        const location = [record.photographyLocation ?? "촬영 장소 미상", record.photographyMonth]
          .filter(Boolean)
          .join(" · ");
        return {
          id: record.contentId,
          title: record.title,
          subtitle: location,
          cells: {
            preview: (
              <TablePhotoPreview
                src={record.imageUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ),
            title: <TablePrimary>{record.title}</TablePrimary>,
            location,
            photographer: record.photographer ?? "-",
            contentId: <CodeText>{record.contentId}</CodeText>,
            syncedAt: formatDate(record.syncedAt),
          },
          details: [
            { label: "촬영지", value: record.photographyLocation ?? "정보 없음" },
            { label: "촬영월", value: record.photographyMonth ?? "정보 없음" },
            { label: "촬영자", value: record.photographer ?? "정보 없음" },
            { label: "콘텐츠 ID", value: record.contentId },
            { label: "검색 키워드", value: record.searchKeyword ?? "정보 없음" },
            { label: "동기화", value: formatDate(record.syncedAt) },
            {
              label: "원본 이미지",
              value: (
                <PhotoLink href={record.imageUrl} target="_blank" rel="noreferrer">
                  이미지 열기
                </PhotoLink>
              ),
            },
          ],
          rawPayload: record.rawPayload,
        };
      })}
    />
  );
}

function WellnessRecords({
  records,
}: {
  records: WellnessTourismSourceItem[];
}) {
  return (
    <RecordDataTable
      label="웰니스 관광 원본 목록"
      emptyMessage="저장된 웰니스 관광 원본이 없습니다."
      columns={[
        { key: "title", label: "관광지", mobile: "primary" },
        { key: "contentId", label: "콘텐츠 ID", mobile: "hide" },
        { key: "theme", label: "테마", mobile: "value" },
        { key: "region", label: "지역 코드", mobile: "secondary" },
        { key: "language", label: "언어", mobile: "hide" },
        { key: "syncedAt", label: "동기화", mobile: "hide" },
      ]}
      rows={records.map((record) => {
        const region = `${record.areaCode ?? "-"} / ${record.sigunguCode ?? "-"}`;
        const theme = getWellnessThemeLabel(record.wellnessThemeCode);
        return {
          id: record.id,
          title: record.title,
          subtitle: `지역 ${region} · ${theme}`,
          cells: {
            title: <TablePrimary>{record.title}</TablePrimary>,
            contentId: <CodeText>{record.contentId}</CodeText>,
            theme: <TaxonomyBadge>{theme}</TaxonomyBadge>,
            region,
            language: record.langDivCd,
            syncedAt: formatDate(record.syncedAt),
          },
          details: [
            { label: "콘텐츠 ID", value: record.contentId },
            { label: "콘텐츠 유형", value: record.contentTypeId ?? "미분류" },
            { label: "웰니스 테마", value: theme },
            { label: "지역 코드", value: region },
            { label: "언어", value: record.langDivCd },
            {
              label: "원본 수정",
              value: record.sourceModifiedAt
                ? formatDate(record.sourceModifiedAt)
                : "정보 없음",
            },
            { label: "동기화", value: formatDate(record.syncedAt) },
          ],
          rawPayload: record.rawPayload,
        };
      })}
    />
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
                <span>원본 레코드</span>
                <h2 id="place-drawer-title">{selectedRecord.title}</h2>
              </div>
              <DrawerCloseButton
                type="button"
                autoFocus
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
  return (
    <RecordDataTable
      label="지역 관광 지표 목록"
      emptyMessage="저장된 지역 지표가 없습니다."
      columns={[
        { key: "baseYm", label: "기준월", mobile: "hide" },
        { key: "metric", label: "지표", mobile: "primary" },
        { key: "type", label: "유형", mobile: "hide" },
        { key: "region", label: "지역", mobile: "secondary" },
        { key: "value", label: "값", numeric: true, mobile: "value" },
        { key: "code", label: "코드", mobile: "hide" },
        { key: "syncedAt", label: "동기화", mobile: "hide" },
      ]}
      rows={metrics.map((metric) => {
        const region = `${metric.areaName} ${normalizeSigunguName(metric.sigunguName)}`;
        const type = getMetricTypeLabel(metric.metricType);
        return {
          id: metric.id,
          title: metric.metricName,
          subtitle: `${region} · ${formatBaseYm(metric.baseYm)}`,
          cells: {
            baseYm: formatBaseYm(metric.baseYm),
            metric: <TablePrimary>{metric.metricName}</TablePrimary>,
            type,
            region,
            value: <TableMetric>{metric.metricValue ?? "-"}</TableMetric>,
            code: <CodeText>{metric.metricCode}</CodeText>,
            syncedAt: formatDate(metric.syncedAt),
          },
          details: [
            { label: "기준월", value: formatBaseYm(metric.baseYm) },
            { label: "지표", value: metric.metricName },
            { label: "지표 유형", value: type },
            { label: "지역", value: region },
            { label: "값", value: metric.metricValue ?? "-" },
            { label: "지표 코드", value: metric.metricCode },
            { label: "동기화", value: formatDate(metric.syncedAt) },
          ],
          rawPayload: metric.rawPayload,
        };
      })}
    />
  );
}

function SyncRuns({ runs }: { runs: ExternalDataSyncRunItem[] }) {
  return (
    <RecordDataTable
      label="공공데이터 동기화 실행 기록"
      emptyMessage="동기화 실행 기록이 없습니다."
      columns={[
        { key: "startedAt", label: "시작", mobile: "secondary" },
        { key: "source", label: "데이터 소스", mobile: "primary" },
        { key: "operation", label: "작업", mobile: "hide" },
        { key: "status", label: "상태", mobile: "value" },
        { key: "received", label: "수신", numeric: true, mobile: "hide" },
        { key: "created", label: "추가", numeric: true, mobile: "hide" },
        { key: "updated", label: "갱신", numeric: true, mobile: "hide" },
        { key: "skipped", label: "제외", numeric: true, mobile: "hide" },
        { key: "failed", label: "실패", numeric: true, mobile: "hide" },
      ]}
      rows={runs.map((run) => {
        const source = getSourceLabel(run.source);
        const status = getRunStatusLabel(run.status);
        return {
          id: run.id,
          title: source,
          subtitle: `${run.operation} · ${formatDate(run.startedAt)}`,
          cells: {
            startedAt: formatDate(run.startedAt),
            source: <TablePrimary>{source}</TablePrimary>,
            operation: run.operation,
            status: <StatusBadge $tone={run.status}>{status}</StatusBadge>,
            received: run.receivedCount.toLocaleString("ko-KR"),
            created: run.createdCount.toLocaleString("ko-KR"),
            updated: run.updatedCount.toLocaleString("ko-KR"),
            skipped: run.skippedCount.toLocaleString("ko-KR"),
            failed: run.failedCount.toLocaleString("ko-KR"),
          },
          details: [
            { label: "데이터 소스", value: source },
            { label: "작업", value: run.operation },
            { label: "상태", value: status },
            { label: "시작", value: formatDate(run.startedAt) },
            {
              label: "종료",
              value: run.finishedAt ? formatDate(run.finishedAt) : "진행 중",
            },
            { label: "수신", value: run.receivedCount.toLocaleString("ko-KR") },
            { label: "추가", value: run.createdCount.toLocaleString("ko-KR") },
            { label: "갱신", value: run.updatedCount.toLocaleString("ko-KR") },
            { label: "제외", value: run.skippedCount.toLocaleString("ko-KR") },
            { label: "실패", value: run.failedCount.toLocaleString("ko-KR") },
            ...(run.errorMessage
              ? [{ label: "오류", value: <ErrorText>{run.errorMessage}</ErrorText> }]
              : []),
          ],
          rawPayload: run.parameters,
          rawLabel: "요청 조건",
        };
      })}
    />
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
    value === "related" ||
    value === "concentration" ||
    value === "visitors" ||
    value === "photos" ||
    value === "metrics" ||
    value === "runs"
    ? value
    : "places";
}

function normalizeWorkspaceMode(
  value: unknown,
  tab: TourismDataTab,
): TourismWorkspaceMode {
  if (value === "overview") return "overview";
  if (value === "runs" || tab === "runs") return "runs";
  return "explorer";
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

function toMonthInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getPreviousMonthInputValue() {
  const previousMonth = new Date();
  previousMonth.setDate(1);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  return toMonthInputValue(previousMonth);
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
  if (value === "ktoRelatedTourism") {
    return "관광지별 연관 관광지";
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

function getCollectionStatusLabel(
  status:
    | "complete"
    | "collecting"
    | "quota_wait"
    | "error"
    | "ready",
) {
  if (status === "complete") return "완료";
  if (status === "collecting") return "수집 중";
  if (status === "quota_wait") return "한도 대기";
  if (status === "error") return "오류";
  return "수집 전";
}

function getCollectionErrorLabel(message: string) {
  if (message.includes("HTTP 429")) return "호출 한도 대기";
  if (message.includes("시간이 초과")) return "응답 시간 초과";
  if (message.includes("HTTP 502")) return "일시적인 서버 오류";
  return "오류 확인 필요";
}

function getSearchPlaceholder(tab: TourismDataTab) {
  if (tab === "places") return "콘텐츠 ID, 관광지명, 시도 또는 시군구 검색";
  if (tab === "wellness") return "콘텐츠 ID, 웰니스 관광지명 또는 테마 코드 검색";
  if (tab === "municipalCore") return "관광지명, 지역명 또는 기준월 검색";
  if (tab === "related") return "중심·연관 관광지명, 지역명 또는 기준월 검색";
  if (tab === "concentration") return "관광지명, 지역명 또는 기준일 검색";
  if (tab === "visitors") return "지역명, 방문자 유형 또는 기준일 검색";
  if (tab === "photos") return "사진 ID, 제목, 촬영지 또는 키워드 검색";
  if (tab === "metrics") return "지표명, 지역명 또는 기준월 검색";
  return "데이터 소스, 실행 작업 또는 상태 검색";
}

const Page = styled.div`
  height: 100dvh;
  overflow-y: auto;
  background: var(--color-app-background);
  color: var(--color-text);
  -webkit-overflow-scrolling: touch;

  :where(button, a, input, select, textarea, summary, [tabindex]):focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }

  &:has([aria-modal="true"]) {
    overflow: hidden;
  }
`;

const Header = styled.header`
  position: sticky;
  z-index: 20;
  top: 0;
  border-bottom: 1px solid var(--color-neutral-400);
  background: rgb(var(--color-white-rgb) / 0.94);
  backdrop-filter: blur(12px);
`;

const HeaderInner = styled.div`
  width: min(100%, 1360px);
  min-height: 72px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-8);
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
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-neutral-400);
  border-radius: 8px;
  background: var(--color-white);
  color: var(--color-brand-1000);
  font-size: var(--font-size-700);
  line-height: 1;
`;

const Eyebrow = styled.span`
  display: block;
  color: var(--color-brand-800);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
`;

const RefreshButton = styled.button`
  min-height: 40px;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-neutral-400);
  border-radius: 8px;
  background: var(--color-white);
  color: var(--color-text);
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
  width: min(100%, 1360px);
  display: grid;
  gap: var(--space-5);
  padding: var(--space-6) var(--space-8) var(--space-10);
  margin: 0 auto;

  @media (max-width: 640px) {
    gap: var(--space-3);
    padding: var(--space-4) var(--space-4) var(--space-10);
  }
`;

const WorkspaceNav = styled.nav`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--color-neutral-400);
  border-radius: 10px;
  background: var(--color-white);

  @media (max-width: 640px) {
    position: sticky;
    z-index: 12;
    top: max(68px, calc(36px + env(safe-area-inset-top)));
    border-radius: 8px;
    box-shadow: 0 4px 12px rgb(var(--color-black-rgb) / 0.06);
  }
`;

const WorkspaceNavButton = styled.button<{ $active: boolean }>`
  position: relative;
  min-width: 0;
  min-height: 64px;
  display: grid;
  align-content: center;
  gap: 2px;
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-right: 1px solid var(--color-neutral-300);
  border-radius: 0;
  background: ${({ $active }) =>
    $active ? "var(--color-brand-100)" : "var(--color-white)"};
  color: ${({ $active }) =>
    $active ? "var(--color-brand-1000)" : "var(--color-text-muted)"};
  text-align: left;
  font: inherit;
  cursor: pointer;

  &:first-of-type {
    border-radius: 9px 0 0 9px;
  }

  &:last-of-type {
    border-right: 0;
    border-radius: 0 9px 9px 0;
  }

  &::after {
    position: absolute;
    right: var(--space-4);
    bottom: 0;
    left: var(--space-4);
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: ${({ $active }) =>
      $active ? "var(--color-brand-700)" : "transparent"};
    content: "";
  }

  span {
    font-size: var(--font-size-200);
    font-weight: 750;
  }

  small {
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:focus-visible {
    z-index: 1;
    outline: 3px solid var(--color-brand-900);
    outline-offset: -3px;
  }

  @media (max-width: 640px) {
    min-height: 48px;
    justify-items: center;
    padding: 0 var(--space-2);
    text-align: center;

    small {
      display: none;
    }

    &::after {
      right: var(--space-3);
      left: var(--space-3);
    }
  }
`;

const OverviewWorkspace = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
  gap: var(--space-4);

  > :nth-of-type(n + 3) {
    grid-column: 1 / -1;
  }

  @media (max-width: 920px) {
    grid-template-columns: 1fr;

    > * {
      grid-column: 1;
    }
  }
`;

const ExplorerWorkspace = styled.div`
  min-width: 0;
  display: grid;
  gap: var(--space-4);

  @media (max-width: 640px) {
    gap: var(--space-3);
  }
`;

const CollectionSection = styled.section`
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-neutral-400);
  border-radius: 10px;
  background: var(--color-white);

  @media (max-width: 640px) {
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: 8px;
  }
`;

const CollectionHeader = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-5);

  h2 {
    margin-top: var(--space-1);
    font-size: var(--font-size-500);
  }

  p {
    margin-top: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  @media (max-width: 640px) {
    align-items: center;

    h2 {
      font-size: var(--font-size-400);
    }

    p {
      display: none;
    }
  }
`;

const CollectionHeadline = styled.div`
  min-width: max-content;
  display: grid;
  justify-items: end;

  strong {
    color: var(--color-brand-900);
    font-size: var(--font-size-700);
    line-height: 1;
  }

  span {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  @media (max-width: 640px) {
    strong {
      font-size: var(--font-size-500);
    }
  }
`;

const CollectionSummary = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--color-neutral-300);
  border-radius: 8px;

  > span {
    min-width: 0;
    padding: var(--space-3) var(--space-4);
    border-right: 1px solid var(--color-neutral-300);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);

    &:last-child {
      border-right: 0;
    }
  }

  strong {
    color: var(--color-text);
  }

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > span {
      overflow: hidden;
      padding: var(--space-2) var(--space-3);
      text-overflow: ellipsis;
      white-space: nowrap;

      &:last-child {
        grid-column: 1 / -1;
        border-top: 1px solid var(--color-neutral-300);
      }

      &:nth-child(2) {
        border-right: 0;
      }
    }
  }
`;

const CollectionTableFrame = styled.div`
  overflow-x: auto;
  border: 1px solid var(--color-neutral-300);
  border-radius: 8px;

  @media (max-width: 720px) {
    overflow: hidden;
  }
`;

const CollectionTable = styled.table`
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  font-size: var(--font-size-100);
  font-variant-numeric: tabular-nums;

  th,
  td {
    padding: var(--space-3);
    border-bottom: 1px solid var(--color-neutral-300);
    text-align: left;
    vertical-align: middle;
  }

  thead th {
    background: var(--color-neutral-200);
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  tbody tr:last-child > * {
    border-bottom: 0;
  }

  tbody th {
    min-width: 210px;
    font-weight: 700;

    strong,
    small {
      display: block;
    }

    small {
      max-width: 280px;
      overflow: hidden;
      margin-top: 2px;
      color: var(--color-text-muted);
      font-weight: 400;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  [data-numeric="true"] {
    text-align: right;
  }

  @media (max-width: 720px) {
    min-width: 0;
    display: block;

    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    tbody {
      display: block;
    }

    tbody tr {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-2) var(--space-3);
      padding: var(--space-3);
      border-bottom: 1px solid var(--color-neutral-300);
    }

    tbody tr:last-child {
      border-bottom: 0;
    }

    th,
    td {
      padding: 0;
      border: 0;
    }

    tbody th {
      grid-column: 1 / 3;
      grid-row: 1;

      small {
        max-width: none;
      }
    }

    td[data-label="상태"] {
      grid-column: 3;
      grid-row: 1;
      justify-self: end;
    }

    td[data-label="진행"] {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    td[data-label="저장"],
    td[data-label="남은 작업"],
    td[data-label="실패"] {
      display: grid;
      gap: 2px;
      grid-row: 3;
      text-align: left;

      &::before {
        color: var(--color-text-muted);
        font-size: 10px;
        content: attr(data-label);
      }
    }

    td[data-label="최근 결과"] {
      grid-column: 1 / -1;
      grid-row: 4;
      padding-top: var(--space-2);
      border-top: 1px solid var(--color-neutral-300);
    }
  }
`;

const InlineProgress = styled.div`
  min-width: 118px;
  display: grid;
  grid-template-columns: 38px minmax(72px, 1fr);
  align-items: center;
  gap: var(--space-2);

  > span {
    font-weight: 700;
    text-align: right;
  }

  @media (max-width: 720px) {
    grid-template-columns: 42px minmax(0, 1fr);
  }
`;

const TableMuted = styled.span`
  color: var(--color-text-muted);
`;

const CollectionStatus = styled.span<{
  $status: "complete" | "collecting" | "quota_wait" | "error" | "ready";
}>`
  flex: 0 0 auto;
  padding: var(--space-1) var(--space-2);
  border-radius: 999px;
  background: ${({ $status }) =>
    $status === "complete"
      ? "var(--color-secondary-300)"
      : $status === "quota_wait"
        ? "#FFF1D6"
        : $status === "error"
          ? "#FDE8EA"
          : "var(--color-brand-200)"};
  color: ${({ $status }) =>
    $status === "error"
      ? "var(--color-error)"
      : $status === "quota_wait"
        ? "var(--color-warning)"
        : "var(--color-text)"};
  font-size: 11px;
  font-weight: 700;
`;

const CollectionProgressTrack = styled.div`
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-neutral-300);
`;

const CollectionProgressBar = styled.div<{
  $progress: number;
  $status: "complete" | "collecting" | "quota_wait" | "error" | "ready";
}>`
  width: ${({ $progress }) => `${Math.max(0, Math.min(100, $progress))}%`};
  height: 100%;
  border-radius: inherit;
  background: ${({ $status }) =>
    $status === "complete"
      ? "var(--color-secondary-600)"
      : $status === "quota_wait"
        ? "var(--color-warning)"
        : $status === "error"
          ? "var(--color-error)"
          : "var(--color-brand-600)"};
`;

const CollectionError = styled.small`
  flex: 0 0 auto;
  color: var(--color-error);
  font-weight: 700;
`;

const CollectionNotice = styled.p`
  display: flex;
  align-items: start;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);

  span {
    width: var(--space-2);
    height: var(--space-2);
    flex: 0 0 auto;
    margin-top: 0.45em;
    border-radius: 2px;
    background: var(--color-secondary-600);
  }
`;

const CrowdCoverageSection = styled.section`
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-neutral-400);
  border-radius: 10px;
  background: var(--color-white);

  @media (max-width: 640px) {
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: 8px;
  }
`;

const CrowdCoverageHeader = styled.div`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-6);

  h2 {
    margin-top: var(--space-1);
    font-size: var(--font-size-500);
  }

  p {
    max-width: 620px;
    margin-top: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  @media (max-width: 640px) {
    align-items: start;
    gap: var(--space-3);

    h2 {
      font-size: var(--font-size-400);
    }
  }
`;

const CrowdCoverageHeadline = styled.div`
  flex: 0 0 auto;
  display: grid;
  justify-items: end;
  gap: var(--space-1);

  strong {
    color: var(--color-brand-800);
    font-size: var(--font-size-700);
    line-height: 1;
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  @media (max-width: 640px) {
    strong {
      font-size: var(--font-size-600);
    }
  }
`;

const CrowdCoverageBar = styled.div`
  width: 100%;
  height: var(--space-3);
  display: flex;
  overflow: hidden;
  border-radius: 3px;
  background: var(--color-neutral-200);
`;

const CrowdLegend = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-100);
  font-variant-numeric: tabular-nums;

  th,
  td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-neutral-300);
    text-align: left;
  }

  thead th {
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 700;
  }

  tbody tr:last-child > * {
    border-bottom: 0;
  }

  tbody th {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 700;
    white-space: nowrap;

    span {
      width: 8px;
      height: 8px;
      flex: 0 0 auto;
      border-radius: 2px;
      background: var(--color-neutral-500);
    }
  }

  tr[data-tone="realtime"] th span {
    background: var(--color-brand-600);
  }

  tr[data-tone="forecast"] th span {
    background: var(--color-secondary-700);
  }

  tr[data-tone="estimate"] th span {
    background: var(--color-secondary-400);
  }

  [data-numeric="true"] {
    text-align: right;
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    tbody,
    tr {
      display: block;
    }

    tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      border-bottom: 1px solid var(--color-neutral-300);
    }

    tbody tr:last-child {
      border-bottom: 0;
    }

    th,
    td {
      padding: var(--space-2);
      border: 0;
    }

    td:last-child {
      display: none;
    }
  }
`;

const CrowdCoverageSegment = styled.span`
  height: 100%;

  &[data-tone="realtime"] {
    background: var(--color-brand-600);
  }

  &[data-tone="forecast"] {
    background: var(--color-secondary-700);
  }

  &[data-tone="estimate"] {
    background: var(--color-secondary-400);
  }

  &[data-tone="unavailable"] {
    background: var(--color-neutral-500);
  }
`;

const CrowdCoverageMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const CrowdCoverageNote = styled.p`
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-neutral-200);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const OverviewSection = styled.section`
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-neutral-400);
  border-radius: 10px;
  background: var(--color-white);

  @media (max-width: 640px) {
    padding: var(--space-4);
    border-radius: 8px;
  }
`;

const SectionHeading = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-4);

  h2 {
    margin-top: var(--space-1);
    font-size: var(--font-size-400);
  }

  p {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  @media (max-width: 560px) {
    align-items: stretch;
    flex-direction: column;
  }
`;

const ConnectionSummary = styled.div<{ $configured: boolean }>`
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-neutral-300);
  border-radius: 8px;

  > span {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 2px;
    background: ${({ $configured }) =>
      $configured ? "var(--color-success)" : "var(--color-error)"};
  }

  strong,
  small {
    display: block;
  }

  strong {
    font-size: var(--font-size-100);
  }

  small {
    color: var(--color-text-muted);
    font-size: 11px;
  }
`;

const InventoryTable = styled.table`
  width: 100%;
  border: 1px solid var(--color-neutral-300);
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 8px;
  font-size: var(--font-size-100);
  font-variant-numeric: tabular-nums;

  th,
  td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-neutral-300);
  }

  thead th {
    background: var(--color-neutral-200);
    color: var(--color-text-muted);
    font-size: 11px;
    text-align: left;
  }

  thead th:last-child,
  tbody td {
    text-align: right;
  }

  tbody th {
    font-weight: 600;
    text-align: left;
  }

  tbody tr:last-child > * {
    border-bottom: 0;
  }
`;

const LastSync = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);

  strong {
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
  }
`;

const SyncSection = styled.section`
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-neutral-400);
  border-radius: 10px;
  background: var(--color-white);

  h2 {
    font-size: var(--font-size-400);
  }

  p {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  @media (max-width: 640px) {
    padding: var(--space-4);
    border-radius: 8px;
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
  border-radius: 7px;
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
  border-radius: 7px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
`;

const PrimaryButton = styled.button`
  min-height: 44px;
  padding: 0 var(--space-5);
  border: 0;
  border-radius: 7px;
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

const DatasetTabs = styled.nav`
  display: flex;
  gap: 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--color-neutral-400);
  scroll-snap-type: x proximity;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (max-width: 640px) {
    margin: 0 calc(var(--space-4) * -1);
    padding: 0 var(--space-4);
  }
`;

const DatasetTabButton = styled.button<{ $active: boolean }>`
  position: relative;
  min-width: max-content;
  min-height: 44px;
  padding: 0 var(--space-4);
  border: 0;
  border-radius: 0;
  background: transparent;
  color: ${({ $active }) =>
    $active ? "var(--color-brand-1000)" : "var(--color-text-muted)"};
  font: inherit;
  font-size: var(--font-size-100);
  font-weight: 700;
  cursor: pointer;
  scroll-snap-align: start;

  &::after {
    position: absolute;
    right: var(--space-3);
    bottom: -1px;
    left: var(--space-3);
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: ${({ $active }) =>
      $active ? "var(--color-brand-700)" : "transparent"};
    content: "";
  }

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: -3px;
  }

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

const DatasetHeader = styled.section`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-4);
  border: 1px solid var(--color-neutral-400);
  border-radius: 8px;
  background: var(--color-white);

  h2 {
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
    gap: var(--space-4);
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

const DatasetHeaderSide = styled.div`
  min-width: min(100%, 320px);
  display: grid;
  gap: var(--space-2);

  @media (max-width: 720px) {
    min-width: 0;
  }
`;

const DatasetFilter = styled.label`
  display: grid;
  gap: var(--space-1);

  > span {
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 700;
  }
`;

const DatasetHeaderStats = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: var(--space-2);

  > div {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    border-left: 2px solid var(--color-brand-500);
    border-radius: 0;
    background: var(--color-neutral-200);
  }

  span {
    color: var(--color-text-muted);
    font-size: 11px;
  }

  strong {
    font-size: var(--font-size-200);
  }

  @media (max-width: 480px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > div {
      padding: var(--space-3);
    }
  }
`;

const PlaceExplorerHeader = styled.section`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-4);
  border: 1px solid var(--color-neutral-400);
  border-radius: 8px;
  background: var(--color-white);

  h2,
  p {
    display: block;
  }

  h2 {
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
    padding: var(--space-4);
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
  padding: var(--space-2) var(--space-3);
  border-left: 2px solid var(--color-brand-500);
  border-radius: 0;
  background: var(--color-white);

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  strong {
    font-size: var(--font-size-400);
  }

  @media (max-width: 640px) {
    gap: 0;
    padding: var(--space-2);

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
  border-radius: 8px;
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
  border-radius: 7px;
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
  border-radius: 8px;
  background: var(--color-surface);

  @media (max-width: 720px) {
    overflow: hidden;
    border: 1px solid var(--color-neutral-400);
    border-radius: 8px;
    background: var(--color-white);
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
    gap: 0;
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
    border: 0;
    border-bottom: 1px solid var(--color-neutral-300);
    border-radius: 0;
    background: var(--color-surface);

    &:last-child {
      border-bottom: 0;
    }
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
  border-radius: 8px;
  background: var(--color-neutral-200);
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
  border-radius: 7px;
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
  border-radius: 8px;
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
    border-radius: 12px 12px 0 0;
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

  p {
    margin-top: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const DrawerCloseButton = styled.button`
  width: 40px;
  height: 40px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 7px;
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
    min-height: 72px;
    display: grid;
    align-content: start;
    gap: var(--space-2);
    padding: var(--space-4);
    border: 1px solid var(--color-neutral-300);
    border-radius: 8px;
    background: var(--color-white);
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

const RecordDetailGrid = styled(PlaceDetailGrid)`
  margin-top: var(--space-6);

  > div {
    min-height: 0;
  }
`;

const PaginationNav = styled.nav`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-white);

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
  border-radius: 7px;
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
  border-radius: 7px;
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

const RecordTableFrame = styled.div`
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--color-neutral-400);
  border-radius: 8px;
  background: var(--color-white);

  @media (max-width: 720px) {
    overflow: hidden;
  }
`;

const RecordTable = styled.table`
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  font-size: var(--font-size-100);
  font-variant-numeric: tabular-nums;

  th,
  td {
    min-width: 0;
    padding: var(--space-3);
    border-bottom: 1px solid var(--color-neutral-300);
    color: var(--color-text-muted);
    text-align: left;
    vertical-align: middle;
  }

  thead th {
    position: sticky;
    z-index: 1;
    top: 0;
    background: var(--color-neutral-200);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  thead th:last-child {
    width: 64px;
    text-align: right;
  }

  tbody tr {
    transition: background 120ms ease;

    &:hover {
      background: var(--color-brand-100);
    }
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  td[data-numeric="true"],
  th[data-numeric="true"] {
    text-align: right;
  }

  td:last-child {
    text-align: right;
  }

  @media (prefers-reduced-motion: reduce) {
    tbody tr {
      transition: none;
    }
  }

  @media (max-width: 720px) {
    min-width: 0;
    display: block;

    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    tbody {
      display: block;
    }

    tbody tr {
      min-height: 68px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto auto;
      align-items: center;
      gap: 2px var(--space-3);
      padding: var(--space-3);
      border-bottom: 1px solid var(--color-neutral-300);
    }

    tbody tr:last-child {
      border-bottom: 0;
    }

    td {
      display: none;
      padding: 0;
      border: 0;
    }

    td[data-mobile="primary"] {
      min-width: 0;
      display: block;
      grid-column: 1;
      grid-row: 1;
      color: var(--color-text);
    }

    td[data-mobile="secondary"] {
      min-width: 0;
      display: block;
      overflow: hidden;
      grid-column: 1;
      grid-row: 2;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    td[data-mobile="value"] {
      display: block;
      grid-column: 2;
      grid-row: 1;
      justify-self: end;
      color: var(--color-text);
      text-align: right;
    }

    td[data-mobile="action"] {
      display: block;
      grid-column: 2;
      grid-row: 2;
      justify-self: end;
    }
  }
`;

const RowDetailButton = styled.button`
  min-height: 32px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-neutral-400);
  border-radius: 6px;
  background: var(--color-white);
  color: var(--color-brand-900);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    border-color: var(--color-brand-600);
    outline: 0;
    background: var(--color-brand-100);
  }
`;

const PrimaryCellButton = styled.button`
  width: 100%;
  min-height: 36px;
  display: block;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;

  &:focus-visible {
    border-radius: 4px;
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }

  @media (max-width: 720px) {
    min-height: 44px;
    display: grid;
    align-items: center;
  }
`;

const TablePrimary = styled.strong`
  display: block;
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-100);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TableMetric = styled.strong`
  color: var(--color-text);
  font-size: var(--font-size-200);
  font-variant-numeric: tabular-nums;
`;

const CodeText = styled.code`
  color: var(--color-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
`;

const TablePhotoPreview = styled.img`
  width: 64px;
  height: 44px;
  display: block;
  object-fit: cover;
  border-radius: 6px;
  background: var(--color-neutral-200);
`;

const TaxonomyBadge = styled.span`
  display: inline-block;
  padding: 3px var(--space-2);
  border: 1px solid var(--color-neutral-400);
  border-radius: 999px;
  background: var(--color-white);
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
`;

const StatusBadge = styled.span<{ $tone: string }>`
  min-width: max-content;
  padding: var(--space-2) var(--space-3);
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "success" || $tone === "succeeded" || $tone === "approved"
      ? "var(--color-secondary-300)"
    : $tone === "failed" || $tone === "rejected"
        ? "#FDE8EA"
      : $tone === "partial"
        ? "#FFF1D6"
        : "var(--color-brand-200)"};
  color: ${({ $tone }) =>
    $tone === "failed" || $tone === "rejected"
      ? "var(--color-error)"
      : $tone === "partial"
        ? "var(--color-warning)"
      : "var(--color-text)"};
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const PhotoLink = styled.a`
  flex: 0 0 auto;
  min-height: 36px;
  display: inline-grid;
  place-items: center;
  padding: 0 var(--space-3);
  border-radius: 6px;
  background: var(--color-brand-100);
  color: var(--color-brand-1000);
  font-size: var(--font-size-100);
  font-weight: 700;
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
    border-radius: 7px;
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
  border: 1px solid var(--color-neutral-300);
  border-radius: 8px;
  background: var(--color-neutral-100);
  color: var(--color-text-muted);
`;

const ErrorNotice = styled.div`
  padding: var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: 7px;
  color: var(--color-error);
`;

const SuccessNotice = styled.div`
  padding: var(--space-4);
  border-radius: 7px;
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
  border-radius: 10px;
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
  border-radius: 7px;
  background: var(--color-brand-700);
  color: var(--color-white);
  font-weight: 700;
`;
