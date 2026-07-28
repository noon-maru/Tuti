"use client";

import styled from "@emotion/styled";
import Link from "next/link";
import {
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
  TouristSpotConcentrationRateItem,
  RegionalVisitorCountItem,
} from "@/shared/api/tourismAdmin";

type SyncSource =
  | "places"
  | "wellness"
  | "municipalCore"
  | "concentration"
  | "visitorMetropolitan"
  | "visitorMunicipal"
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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const searchParams = new URLSearchParams({ tab });

    if (appliedQuery) searchParams.set("q", appliedQuery);

    try {
      const response = await fetchAdminJson<TourismDataResponse>(
        `tourism-data?${searchParams}`,
      );
      setData(response);
      setAccessStatus(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
      setAccessStatus(
        loadError instanceof AdminApiError ? loadError.status : null,
      );
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, tab]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    const handlePopState = () => {
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

  const changeTab = (nextTab: TourismDataTab) => {
    setTab(nextTab);
    setQuery("");
    setAppliedQuery("");
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
        {data && <Overview overview={data.overview} />}
        <SyncPanel syncing={syncing} onSync={sync} />

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
          <PlaceRecords records={data?.places ?? []} />
        ) : tab === "wellness" ? (
          <WellnessRecords records={data?.wellness ?? []} />
        ) : tab === "municipalCore" ? (
          <MunicipalCoreRecords records={data?.municipalCore ?? []} />
        ) : tab === "concentration" ? (
          <ConcentrationRecords records={data?.concentration ?? []} />
        ) : tab === "visitors" ? (
          <VisitorRecords records={data?.visitors ?? []} />
        ) : tab === "metrics" ? (
          <MetricRecords metrics={data?.metrics ?? []} />
        ) : (
          <SyncRuns runs={data?.runs ?? []} />
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
    ["집중률 원본", overview.touristSpotConcentrationRecords],
    ["방문자 수", overview.regionalVisitorCountRecords],
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
  const [baseMonth, setBaseMonth] = useState("2025-09");
  const [areaCode, setAreaCode] = useState("11");
  const [sigunguCode, setSigunguCode] = useState("");
  const [municipalSigunguCode, setMunicipalSigunguCode] = useState("11530");
  const [concentrationSpotName, setConcentrationSpotName] = useState("");
  const [visitorDate, setVisitorDate] = useState(() =>
    toDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
  );
  const [metricCode, setMetricCode] = useState("11");
  const [wellnessThemeCode, setWellnessThemeCode] = useState("");
  const selectedMetricOptions = useMemo(
    () =>
      source === "places" ||
      source === "wellness" ||
      source === "municipalCore" ||
      source === "concentration" ||
      source === "visitorMetropolitan" ||
      source === "visitorMunicipal"
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
}: {
  records: TourismPlaceSourceItem[];
}) {
  if (records.length === 0) {
    return <StatePanel>저장된 장소 원본이 없습니다.</StatePanel>;
  }

  return (
    <RecordList>
      {records.map((record) => (
        <RecordCard key={record.contentId}>
          <RecordHeader>
            <div>
              <h2>{record.title}</h2>
              <p>
                콘텐츠 {record.contentId} · 유형{" "}
                {record.contentTypeId ?? "미분류"}
              </p>
            </div>
            <StatusBadge $tone={record.linkedPlaceId ? "success" : "pending"}>
              {record.linkedPlaceId ? "장소 연결됨" : "원본만 저장"}
            </StatusBadge>
          </RecordHeader>
          <Metadata>
            지역 {record.areaCode ?? "-"} / {record.sigunguCode ?? "-"} ·
            동기화 {formatDate(record.syncedAt)}
          </Metadata>
          <RawDetails payload={record.rawPayload} />
        </RecordCard>
      ))}
    </RecordList>
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
    gap: var(--space-5);
    padding: var(--space-5) var(--space-4) var(--space-10);
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
`;

const SearchForm = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
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
    $tone === "success" || $tone === "succeeded"
      ? "var(--color-secondary-300)"
      : $tone === "failed"
        ? "var(--color-neutral-200)"
        : "var(--color-brand-200)"};
  color: ${({ $tone }) =>
    $tone === "failed" ? "var(--color-error)" : "var(--color-text)"};
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const MetricValue = styled.strong`
  color: var(--color-brand-900);
  font-size: var(--font-size-600);
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
