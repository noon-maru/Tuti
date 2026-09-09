"use client";

import styled from "@emotion/styled";
import {
  Activity,
  ArrowLeft,
  LocateFixed,
  MapPin,
  Play,
  Route,
  TimerReset,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  adminJsonRequest,
  AdminApiError,
  fetchAdminJson,
} from "@/lib/adminApi";
import type { TutiPlace } from "@/lib/recommendations";
import type {
  AdminRecommendationScoreBreakdown,
  AdminRecommendationSimulationRequest,
  AdminRecommendationSimulationResponse,
  AdminOverviewResponse,
} from "@/shared/api/admin";
import { tourApiSidoOptions } from "@/shared/tourism/tourApiRegions";
import type {
  AirAnswer,
  BudgetAnswer,
  CompanionAnswer,
  DensityAnswer,
  LongDistanceTimingAnswer,
  MovementAnswer,
} from "@/shared/tuti/types";
import { movementTimeBudget } from "@/shared/tuti/movementTimeBudget";

type LocationMode = "location" | "region" | "none";
type SimulationCandidate =
  AdminRecommendationSimulationResponse["candidates"][number];

const movementOptions = (
  ["near", "short", "half", "far"] as const
).map((value) => ({ value, ...movementTimeBudget[value] }));

const locationPresets = [
  { label: "서울", latitude: "37.5665", longitude: "126.9780" },
  { label: "대구", latitude: "35.8714", longitude: "128.6014" },
  { label: "강릉", latitude: "37.7519", longitude: "128.8761" },
  { label: "제주", latitude: "33.4996", longitude: "126.5312" },
] as const;

const longDistanceTimingOptions: Array<{
  value: LongDistanceTimingAnswer;
  label: string;
  hint: string;
}> = [
  {
    value: "tomorrow_day_trip",
    label: "내일 당일치기",
    hint: "내일 출발해 같은 날 돌아오기",
  },
  {
    value: "overnight_trip",
    label: "오늘 1박",
    hint: "오늘 떠나 내일 돌아오기",
  },
];

const airOptions: Array<{ value: AirAnswer; label: string }> = [
  { value: "quiet", label: "조용한 곳" },
  { value: "open", label: "트인 곳" },
  { value: "walk", label: "걷기 좋은 곳" },
];

const densityOptions: Array<{ value: DensityAnswer; label: string }> = [
  { value: "quiet", label: "조금 한적하게" },
  { value: "balanced", label: "적당히 북적여도" },
  { value: "lively", label: "활기찬 곳도" },
];

const scoreLabels: Record<keyof AdminRecommendationScoreBreakdown, string> = {
  base: "기본 피로도",
  physicalDistance: "직선거리",
  travelTime: "이동시간",
  movementPenalty: "이동 범위",
  moodAdjustment: "공기 성향",
  crowdPenalty: "혼잡도",
  energyPenalty: "에너지 부담",
  executionPenalty: "시간·운영 적합도",
  transferPenalty: "환승 부담",
  walkingPenalty: "실제 도보 부담",
  weatherPenalty: "도착 시각 날씨",
  companionPenalty: "동행자 적합도",
  budgetPenalty: "입장 예산 적합도",
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "medium",
});

export function RecommendationSimulatorScreen() {
  const [locationMode, setLocationMode] = useState<LocationMode>("location");
  const [movement, setMovement] = useState<MovementAnswer>("short");
  const [air, setAir] = useState<AirAnswer>("quiet");
  const [density, setDensity] = useState<DensityAnswer>("balanced");
  const [companion, setCompanion] = useState<CompanionAnswer | undefined>();
  const [budget, setBudget] = useState<BudgetAnswer | undefined>();
  const [longDistanceTiming, setLongDistanceTiming] =
    useState<LongDistanceTimingAnswer>("tomorrow_day_trip");
  const [latitude, setLatitude] = useState("37.5665");
  const [longitude, setLongitude] = useState("126.9780");
  const [areaCode, setAreaCode] = useState("1");
  const [excludedPlaceIds, setExcludedPlaceIds] = useState("");
  const [result, setResult] =
    useState<AdminRecommendationSimulationResponse | null>(null);
  const [resultLocationMode, setResultLocationMode] =
    useState<LocationMode>("location");
  const [loading, setLoading] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<number | null>(null);

  const selectedRegion = useMemo(
    () => tourApiSidoOptions.find(([code]) => code === areaCode),
    [areaCode],
  );

  useEffect(() => {
    let active = true;

    void fetchAdminJson<AdminOverviewResponse>("overview")
      .then(() => {
        if (active) setAccessStatus(null);
      })
      .catch((accessError) => {
        if (!active) return;
        setError(
          accessError instanceof Error
            ? accessError.message
            : "관리자 권한을 확인하지 못했어요.",
        );
        setAccessStatus(
          accessError instanceof AdminApiError ? accessError.status : null,
        );
      })
      .finally(() => {
        if (active) setCheckingAccess(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const request: AdminRecommendationSimulationRequest = {
      answers: {
        movement,
        air,
        density,
        companion,
        budget,
        ...(movement === "far" ? { longDistanceTiming } : {}),
      },
      excludePlaceIds: excludedPlaceIds
        .split(/[\s,]+/)
        .map((placeId) => placeId.trim())
        .filter(Boolean),
    };

    if (locationMode === "location") {
      request.location = {
        latitude: Number(latitude),
        longitude: Number(longitude),
      };
    } else if (locationMode === "region" && selectedRegion) {
      request.preferredRegion = {
        areaCode: selectedRegion[0],
        name: selectedRegion[1],
      };
    }

    try {
      const response =
        await fetchAdminJson<AdminRecommendationSimulationResponse>(
          "recommendation-simulator",
          adminJsonRequest("POST", request),
        );
      setResult(response);
      setResultLocationMode(locationMode);
      setAccessStatus(null);
    } catch (simulationError) {
      setError(
        simulationError instanceof Error
          ? simulationError.message
          : "추천 시뮬레이션을 실행하지 못했어요.",
      );
      setAccessStatus(
        simulationError instanceof AdminApiError
          ? simulationError.status
          : null,
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingAccess) {
    return (
      <AccessPage>
        <AccessLoading role="status">
          관리자 권한을 확인하고 있어요.
        </AccessLoading>
      </AccessPage>
    );
  }

  if (accessStatus === 401 || accessStatus === 403) {
    return (
      <AccessPage>
        <AccessCard>
          <strong>Tuti Admin</strong>
          <h1>{accessStatus === 401 ? "로그인이 필요해요." : "관리자 권한이 필요해요."}</h1>
          <p>{error}</p>
          <PrimaryLink href="/login">로그인하기</PrimaryLink>
          <TextLink href="/">서비스로 돌아가기</TextLink>
        </AccessCard>
      </AccessPage>
    );
  }

  return (
    <Page>
      <Header>
        <HeaderInner>
          <BackLink href="/admin?section=funnel">
            <ArrowLeft aria-hidden="true" />
            관리자 콘솔
          </BackLink>
          <HeaderMain>
            <HeaderCopy>
              <span>RECOMMENDATION CONTROL</span>
              <h1>추천이 좁혀지는<br />과정을 추적합니다.</h1>
              <p>
                사용자 조건을 그대로 입력하고, 후보 탐색부터 최종 선정까지
                장소별 점수와 탈락 근거를 확인하세요.
              </p>
            </HeaderCopy>
            <EngineTrace aria-label="추천 처리 과정">
              <TraceNode>
                <small>INPUT</small>
                <strong>사용자 답변</strong>
              </TraceNode>
              <TraceLine aria-hidden="true" />
              <TraceNode>
                <small>FILTER</small>
                <strong>거리·실행 조건</strong>
              </TraceNode>
              <TraceLine aria-hidden="true" />
              <TraceNode $active>
                <small>OUTPUT</small>
                <strong>최종 6곳</strong>
              </TraceNode>
            </EngineTrace>
          </HeaderMain>
        </HeaderInner>
      </Header>

      <Content>
        <ConditionPanel
          as="form"
          aria-busy={loading}
          aria-describedby={error ? "simulation-error" : undefined}
          onSubmit={submit}
        >
          <PanelHeading>
            <div>
              <span>TEST VECTOR</span>
              <h2>사용자 조건</h2>
            </div>
            <ResetButton
              type="button"
              onClick={() => {
                setLocationMode("location");
                setMovement("short");
                setAir("quiet");
                setDensity("balanced");
                setCompanion(undefined);
                setBudget(undefined);
                setLongDistanceTiming("tomorrow_day_trip");
                setLatitude("37.5665");
                setLongitude("126.9780");
                setAreaCode("1");
                setExcludedPlaceIds("");
              }}
            >
              <TimerReset aria-hidden="true" />
              초기화
            </ResetButton>
          </PanelHeading>
          <ScopeNote>
            명시적 답변만 비교합니다. 개인화 신호는 제외해 같은 조건을 반복
            검증할 수 있습니다.
          </ScopeNote>

          <FieldGroup>
            <FieldLabel><span>01</span> 탐색 기준</FieldLabel>
            <SegmentedGrid $columns={3}>
              {([
                ["location", "현재 위치", "실제 경로 계산"],
                ["region", "선택 지역", "위치 거부 흐름"],
                ["none", "전국", "지역 조건 없음"],
              ] as const).map(([value, label, hint]) => (
                <OptionButton
                  key={value}
                  type="button"
                  $active={locationMode === value}
                  aria-pressed={locationMode === value}
                  disabled={movement === "far" && value !== "location"}
                  onClick={() => setLocationMode(value)}
                >
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </OptionButton>
              ))}
            </SegmentedGrid>
          </FieldGroup>

          {locationMode === "location" ? (
            <LocationEditor>
              <CoordinateGrid>
                <LabeledInput>
                  <span>위도</span>
                  <input
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    value={latitude}
                    onChange={(event) => setLatitude(event.target.value)}
                    required
                  />
                </LabeledInput>
                <LabeledInput>
                  <span>경도</span>
                  <input
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={longitude}
                    onChange={(event) => setLongitude(event.target.value)}
                    required
                  />
                </LabeledInput>
              </CoordinateGrid>
              <PresetRail aria-label="테스트 지역 바로 선택">
                <LocateFixed aria-hidden="true" />
                {locationPresets.map((preset) => (
                  <PresetButton
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setLatitude(preset.latitude);
                      setLongitude(preset.longitude);
                    }}
                  >
                    {preset.label}
                  </PresetButton>
                ))}
              </PresetRail>
            </LocationEditor>
          ) : locationMode === "region" ? (
            <LabeledInput>
              <span>추천 지역</span>
              <select value={areaCode} onChange={(event) => setAreaCode(event.target.value)}>
                {tourApiSidoOptions.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
            </LabeledInput>
          ) : (
            <ModeNotice>위치와 지역 조건 없이 전체 추천 풀에서 계산합니다.</ModeNotice>
          )}

          <FieldGroup>
            <FieldLabel><span>02</span> 낼 수 있는 시간</FieldLabel>
            <SegmentedGrid $columns={2}>
              {movementOptions.map((option) => (
                <OptionButton
                  key={option.value}
                  type="button"
                  $active={movement === option.value}
                  aria-pressed={movement === option.value}
                  onClick={() => {
                    setMovement(option.value);
                    if (option.value === "far") setLocationMode("location");
                  }}
                >
                  <strong>{option.label}</strong>
                  <span>{option.hint}</span>
                </OptionButton>
              ))}
            </SegmentedGrid>
          </FieldGroup>

          {movement === "far" && (
            <FieldGroup>
              <FieldLabel><span>03</span> 장거리 일정</FieldLabel>
              <SegmentedGrid $columns={2}>
                {longDistanceTimingOptions.map((option) => (
                  <OptionButton
                    key={option.value}
                    type="button"
                    $active={longDistanceTiming === option.value}
                    aria-pressed={longDistanceTiming === option.value}
                    onClick={() => setLongDistanceTiming(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.hint}</span>
                  </OptionButton>
                ))}
              </SegmentedGrid>
            </FieldGroup>
          )}

          <FieldGroup>
            <FieldLabel><span>{movement === "far" ? "04" : "03"}</span> 필요한 공기</FieldLabel>
            <CompactOptions>
              {airOptions.map((option) => (
                <CompactButton
                  key={option.value}
                  type="button"
                  $active={air === option.value}
                  aria-pressed={air === option.value}
                  onClick={() => setAir(option.value)}
                >
                  {option.label}
                </CompactButton>
              ))}
            </CompactOptions>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel><span>{movement === "far" ? "05" : "04"}</span> 원하는 분위기</FieldLabel>
            <CompactOptions>
              {densityOptions.map((option) => (
                <CompactButton
                  key={option.value}
                  type="button"
                  $active={density === option.value}
                  aria-pressed={density === option.value}
                  onClick={() => setDensity(option.value)}
                >
                  {option.label}
                </CompactButton>
              ))}
            </CompactOptions>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel><span>{movement === "far" ? "06" : "05"}</span> 보조 조건 <small>선택</small></FieldLabel>
            <OptionalOptions>
              {([
                ["solo", "혼자"],
                ["friend", "친구와"],
                ["partner", "연인과"],
                ["family", "가족과"],
              ] as const).map(([value, label]) => (
                <CompactButton
                  key={value}
                  type="button"
                  $active={companion === value}
                  aria-pressed={companion === value}
                  onClick={() =>
                    setCompanion(companion === value ? undefined : value)
                  }
                >
                  {label}
                </CompactButton>
              ))}
            </OptionalOptions>
            <OptionalOptions>
              {([
                ["free", "입장료 무료"],
                ["under_20000", "입장료 2만원 안쪽"],
              ] as const).map(([value, label]) => (
                <CompactButton
                  key={value}
                  type="button"
                  $active={budget === value}
                  aria-pressed={budget === value}
                  onClick={() => setBudget(budget === value ? undefined : value)}
                >
                  {label}
                </CompactButton>
              ))}
            </OptionalOptions>
            <LabeledInput>
              <span>직전 추천에서 제외할 장소 ID · 최대 20개</span>
              <textarea
                value={excludedPlaceIds}
                onChange={(event) => setExcludedPlaceIds(event.target.value)}
                placeholder="쉼표 또는 줄바꿈으로 구분"
              />
            </LabeledInput>
          </FieldGroup>

          <RunButton type="submit" disabled={loading} aria-busy={loading}>
            {loading ? <Activity aria-hidden="true" /> : <Play aria-hidden="true" />}
            {loading ? "실제 추천 경로를 계산하고 있어요" : "시뮬레이션 실행"}
          </RunButton>
          {error && (
            <ErrorNotice id="simulation-error" role="alert">
              {error}
            </ErrorNotice>
          )}
        </ConditionPanel>

        <ResultArea aria-busy={loading}>
          <ResultAnnouncement role="status" aria-live="polite">
            {loading
              ? "시뮬레이션을 실행하고 있습니다."
              : result
                ? `추천 후보 ${result.candidates.length}개의 비교 결과를 표시했습니다.`
                : ""}
          </ResultAnnouncement>
          {!result ? (
            <EmptyResult>
              <Route aria-hidden="true" />
              <h2>아직 실행 결과가 없어요.</h2>
              <p>조건을 정하고 실행하면 최종 추천과 점수 구성을 보여드려요.</p>
            </EmptyResult>
          ) : (
            <>
              <ResultHeader>
                <div>
                  <span>ENGINE / {result.algorithmVersion}</span>
                  <h2>추천 경로 분석</h2>
                  <p>
                    <time dateTime={result.generatedAt}>
                      {dateFormatter.format(new Date(result.generatedAt))}
                    </time>{" "}
                    · {result.elapsedMs.toLocaleString()}ms
                  </p>
                  <ScoreGuide>총점은 낮을수록 부담이 낮고, 음수 항목은 추천 보너스예요.</ScoreGuide>
                </div>
                <FeatureSummary>
                  <span>에너지 {featureLabel(result.feature.energy)}</span>
                  <span>이동 {movementLabel(result.feature.movement)}</span>
                  <span>혼잡 허용 {crowdToleranceLabel(result.feature.crowdTolerance)}</span>
                </FeatureSummary>
              </ResultHeader>

              <MetricGrid>
                <MetricCard><small>01</small><span>탐색 후보</span><strong>{result.sourceCandidateCount.toLocaleString()}</strong></MetricCard>
                <MetricCard><small>02</small><span>조건 통과</span><strong>{result.eligibleCandidateCount.toLocaleString()}</strong></MetricCard>
                <MetricCard><small>03</small><span>정밀 비교</span><strong>{result.shortlistCount.toLocaleString()}</strong></MetricCard>
                <MetricCard $accent><small>04</small><span>최종 추천</span><strong>{result.candidates.filter((candidate) => candidate.selected).length}</strong></MetricCard>
              </MetricGrid>

              <CandidateComparison aria-labelledby="candidate-comparison-title">
                <CandidateComparisonHeader>
                  <div>
                    <h3 id="candidate-comparison-title">후보 비교</h3>
                    <p>순위, 이동 부담, 선정 근거를 같은 행에서 비교합니다.</p>
                  </div>
                  <span>{result.candidates.length}개 후보</span>
                </CandidateComparisonHeader>

                <CandidateTableViewport>
                  <CandidateTable>
                    <caption>추천 시뮬레이션 후보 비교</caption>
                    <thead>
                      <tr>
                        <th scope="col">순위</th>
                        <th scope="col">장소</th>
                        <th scope="col">결과</th>
                        <th scope="col">부담 점수</th>
                        <th scope="col">이동</th>
                        <th scope="col">선정 근거</th>
                        <th scope="col">점수 구성</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.candidates.map((candidate) => (
                        <CandidateTableRow
                          key={candidate.place.id}
                          $selected={candidate.selected}
                        >
                          <td>
                            <RankCell>
                              <strong>{candidate.finalRank}</strong>
                              <span>최종</span>
                              {candidate.initialRank && (
                                <small>초기 {candidate.initialRank}위</small>
                              )}
                            </RankCell>
                          </td>
                          <th scope="row">
                            <TablePlace>
                              <CandidateThumbnail
                                $image={candidate.place.image}
                                aria-hidden="true"
                              />
                              <div>
                                <strong>{candidate.place.name}</strong>
                                <span>
                                  {candidate.place.sourceContentType ??
                                    "유형 미상"}
                                </span>
                              </div>
                            </TablePlace>
                          </th>
                          <td>
                            <StatusPill $selected={candidate.selected}>
                              {candidate.selected ? "추천" : "비추천"}
                            </StatusPill>
                          </td>
                          <td>
                            <Score>
                              {candidate.place.fatigueScore ?? "—"}
                              <small>점</small>
                            </Score>
                          </td>
                          <td>
                            <RouteMeta>
                              <span>
                                <MapPin aria-hidden="true" />
                                {formatDistance(
                                  candidate.place.distanceMeters,
                                )}
                              </span>
                              <span>
                                <Route aria-hidden="true" />
                                {formatTravelTime(
                                  candidate.place.travelTimeSummary,
                                )}
                              </span>
                            </RouteMeta>
                          </td>
                          <td>
                            <ReasonText>
                              <strong>
                                {candidate.place.reason ??
                                  "추천 근거 확인 필요"}
                              </strong>
                              <p>
                                {candidate.place.reasonDetail ??
                                  "세부 추천 근거가 없습니다."}
                              </p>
                              {!candidate.selected && (
                                <ExclusionReason>
                                  {getExclusionReason(resultLocationMode)}
                                </ExclusionReason>
                              )}
                            </ReasonText>
                          </td>
                          <td>
                            <CandidateScoreDetails candidate={candidate} />
                          </td>
                        </CandidateTableRow>
                      ))}
                    </tbody>
                  </CandidateTable>
                </CandidateTableViewport>

                <MobileCandidateList role="list" aria-label="추천 후보 비교">
                  {result.candidates.map((candidate) => (
                    <MobileCandidateRow
                      key={candidate.place.id}
                      $selected={candidate.selected}
                    >
                      <MobileCandidateHeader>
                        <div>
                          <RankLine>
                            <StatusPill $selected={candidate.selected}>
                              {candidate.selected ? "추천" : "비추천"}
                            </StatusPill>
                            <span>최종 {candidate.finalRank}위</span>
                            {candidate.initialRank && (
                              <span>초기 {candidate.initialRank}위</span>
                            )}
                          </RankLine>
                          <h4>{candidate.place.name}</h4>
                          <small>
                            {candidate.place.sourceContentType ?? "유형 미상"}
                          </small>
                        </div>
                        <Score data-mobile-score>
                          {candidate.place.fatigueScore ?? "—"}
                          <small>점</small>
                        </Score>
                      </MobileCandidateHeader>

                      <RouteMeta>
                        <span>
                          <MapPin aria-hidden="true" />
                          {formatDistance(candidate.place.distanceMeters)}
                        </span>
                        <span>
                          <Route aria-hidden="true" />
                          {formatTravelTime(
                            candidate.place.travelTimeSummary,
                          )}
                        </span>
                      </RouteMeta>

                      <ReasonText>
                        <strong>
                          {candidate.place.reason ?? "추천 근거 확인 필요"}
                        </strong>
                        <p>
                          {candidate.place.reasonDetail ??
                            "세부 추천 근거가 없습니다."}
                        </p>
                        {!candidate.selected && (
                          <ExclusionReason>
                            {getExclusionReason(resultLocationMode)}
                          </ExclusionReason>
                        )}
                      </ReasonText>

                      <CandidateScoreDetails candidate={candidate} />
                    </MobileCandidateRow>
                  ))}
                </MobileCandidateList>
              </CandidateComparison>

              <RawDetails>
                <summary>결과 JSON 확인</summary>
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </RawDetails>
            </>
          )}
        </ResultArea>
      </Content>
    </Page>
  );
}

function CandidateScoreDetails({
  candidate,
}: {
  candidate: SimulationCandidate;
}) {
  return (
    <BreakdownDetails>
      <summary aria-label={`${candidate.place.name} 세부 점수 구성`}>
        세부 점수
      </summary>
      <ScoreDefinitionList>
        {Object.entries(candidate.breakdown).map(([key, value]) => (
          <div key={key}>
            <dt>
              {scoreLabels[key as keyof AdminRecommendationScoreBreakdown]}
            </dt>
            <dd data-tone={value < 0 ? "bonus" : value > 0 ? "penalty" : "zero"}>
              {formatScoreValue(value)}
            </dd>
          </div>
        ))}
      </ScoreDefinitionList>
    </BreakdownDetails>
  );
}

function formatScoreValue(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function getExclusionReason(locationMode: LocationMode) {
  return locationMode === "location"
    ? "최종 피로도 순위가 추천 6곳 밖이라 제외"
    : "최종 순위와 장소 유형 다양성 제한에 따라 제외";
}

function formatDistance(meters?: number) {
  if (!Number.isFinite(meters)) return "직선거리 없음";
  return meters! < 1_000 ? `${Math.round(meters!)}m` : `${(meters! / 1_000).toFixed(1)}km`;
}

function formatTravelTime(summary?: TutiPlace["travelTimeSummary"]) {
  if (!summary) return "경로 정보 없음";
  const mode = summary.mode === "walking" ? "도보" : "대중교통";
  const transfer = summary.transfers === null
    ? ""
    : ` · 환승 ${summary.transfers}회`;
  return `${mode} ${Math.round(summary.durationSeconds / 60)}분${transfer}`;
}

function featureLabel(value: string) {
  return value === "low" ? "낮음" : value === "soft" ? "부드러움" : "열림";
}

function movementLabel(value: string) {
  if (value === "near") return "한 시간 안에";
  if (value === "half") return "반나절";
  if (value === "far") return "오늘 하루";
  return "한두 시간";
}

function crowdToleranceLabel(value: string) {
  return value === "low" ? "낮음" : value === "high" ? "높음" : "보통";
}

const Page = styled.main`
  --sim-ink: #102f2d;
  --sim-deep: #174540;
  --sim-route: #39a78e;
  --sim-mint: #cce9df;
  --sim-mist: #eef4f1;
  --sim-paper: #f9fbfa;
  --sim-signal: #f1a45d;
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: auto;
  background-color: var(--sim-mist);
  background-image:
    linear-gradient(rgb(16 47 45 / 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgb(16 47 45 / 0.035) 1px, transparent 1px);
  background-size: 28px 28px;
  color: var(--color-text);
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;

  :where(button, a, input, select, textarea, summary, [tabindex]):focus-visible {
    outline: 3px solid var(--sim-signal);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      scroll-behavior: auto !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

const Header = styled.header`
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid rgb(204 233 223 / 0.3);
  background:
    radial-gradient(circle at 82% 30%, rgb(57 167 142 / 0.2), transparent 32%),
    var(--sim-ink);
  color: #f4faf7;

  &::after {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(90deg, transparent 49.8%, rgb(204 233 223 / 0.08) 50%, transparent 50.2%);
    background-size: 160px 100%;
    content: "";
    pointer-events: none;
  }
`;

const HeaderInner = styled.div`
  position: relative;
  z-index: 1;
  width: min(1360px, calc(100% - 64px));
  margin: 0 auto;
  padding: var(--space-5) 0 var(--space-8);
  display: grid;
  gap: var(--space-5);

  @media (max-width: 768px) {
    width: calc(100% - 32px);
    padding: var(--space-4) 0;
  }
`;

const BackLink = styled(Link)`
  width: fit-content;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: rgb(244 250 247 / 0.7);
  font-size: var(--font-size-200);
  text-decoration: none;

  svg { width: 20px; height: 20px; }

  &:focus-visible {
    outline: 3px solid var(--sim-signal);
    outline-offset: 3px;
  }
`;

const HeaderMain = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(440px, 0.86fr);
  align-items: end;
  gap: var(--space-10);

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
    gap: var(--space-6);
  }
`;

const HeaderCopy = styled.div`
  display: grid;
  gap: var(--space-3);
  span {
    color: var(--sim-signal);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }
  h1 {
    max-width: 680px;
    font-size: clamp(36px, 5vw, 68px);
    font-weight: 760;
    letter-spacing: -0.055em;
    line-height: 1.02;
  }
  p {
    max-width: 610px;
    color: rgb(244 250 247 / 0.7);
    font-size: var(--font-size-300);
    line-height: 1.65;
  }
`;

const EngineTrace = styled.div`
  display: grid;
  grid-template-columns: auto minmax(28px, 1fr) auto minmax(28px, 1fr) auto;
  align-items: center;
  padding: var(--space-5);
  border: 1px solid rgb(204 233 223 / 0.22);
  background: rgb(4 28 27 / 0.36);
  backdrop-filter: blur(10px);

  @media (max-width: 520px) {
    padding: var(--space-4) var(--space-3);
  }
`;

const TraceNode = styled.div<{ $active?: boolean }>`
  position: relative;
  display: grid;
  gap: 4px;
  padding-top: var(--space-4);

  &::before {
    position: absolute;
    top: 0;
    left: 0;
    width: 9px;
    height: 9px;
    border: 2px solid ${({ $active }) => $active ? "var(--sim-signal)" : "var(--sim-route)"};
    border-radius: 50%;
    background: ${({ $active }) => $active ? "var(--sim-signal)" : "var(--sim-ink)"};
    content: "";
  }

  small {
    color: var(--sim-route);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
  }

  strong {
    font-size: 12px;
    white-space: nowrap;
  }
`;

const TraceLine = styled.span`
  height: 1px;
  margin: 0 var(--space-2);
  background: linear-gradient(90deg, var(--sim-route), rgb(57 167 142 / 0.2));
`;

const Content = styled.div`
  width: min(1360px, calc(100% - 64px));
  margin: 0 auto;
  padding: var(--space-6) 0 var(--space-12);
  display: grid;
  grid-template-columns: minmax(350px, 390px) minmax(0, 1fr);
  align-items: start;
  gap: var(--space-6);

  @media (max-width: 1240px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 768px) {
    width: calc(100% - 24px);
    padding-top: var(--space-4);
  }
`;

const ConditionPanel = styled.section`
  position: sticky;
  top: var(--space-4);
  display: grid;
  gap: var(--space-6);
  padding: var(--space-6);
  border: 1px solid rgb(57 167 142 / 0.5);
  border-radius: 20px 20px 20px 4px;
  background: var(--sim-ink);
  box-shadow: 0 22px 50px rgb(16 47 45 / 0.18);
  color: #f4faf7;

  @media (max-width: 1240px) {
    position: static;
  }

  @media (max-width: 480px) {
    padding: var(--space-4);
  }
`;

const PanelHeading = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  span {
    color: var(--sim-signal);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
  }
  h2 { margin-top: var(--space-1); font-size: var(--font-size-500); }
`;

const ScopeNote = styled.p`
  margin-top: calc(var(--space-3) * -1);
  color: rgb(244 250 247 / 0.52);
  font-size: 11px;
  line-height: 1.55;
`;

const ResetButton = styled.button`
  min-height: 44px;
  padding: 0 var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: 0;
  border-radius: var(--space-1);
  border: 1px solid rgb(204 233 223 / 0.18);
  background: rgb(255 255 255 / 0.05);
  color: rgb(244 250 247 / 0.7);
  font: inherit;
  font-size: var(--font-size-100);
  cursor: pointer;
  svg { width: 16px; height: 16px; }

  &:focus-visible {
    outline: 3px solid var(--sim-signal);
    outline-offset: 2px;
  }
`;

const FieldGroup = styled.fieldset`
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
  padding-top: var(--space-5);
  border-top: 1px solid rgb(204 233 223 / 0.13);
`;

const FieldLabel = styled.legend`
  margin-bottom: var(--space-2);
  font-size: var(--font-size-200);
  color: #f4faf7;
  font-weight: 650;

  > span {
    margin-right: var(--space-2);
    color: var(--sim-route);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  small {
    margin-left: var(--space-1);
    color: rgb(244 250 247 / 0.45);
    font-size: 10px;
    font-weight: 500;
  }
`;

const SegmentedGrid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr));
  gap: var(--space-2);
`;

const OptionButton = styled.button<{ $active: boolean }>`
  min-height: 68px;
  padding: var(--space-3) var(--space-2);
  display: grid;
  place-content: center;
  gap: var(--space-1);
  border: 1px solid ${({ $active }) => $active ? "var(--sim-route)" : "rgb(204 233 223 / 0.2)"};
  border-radius: 10px 10px 10px 3px;
  background: ${({ $active }) => $active ? "rgb(57 167 142 / 0.2)" : "rgb(255 255 255 / 0.035)"};
  color: #f4faf7;
  font: inherit;
  text-align: center;
  cursor: pointer;
  strong { font-size: var(--font-size-100); }
  span { color: rgb(244 250 247 / 0.56); font-size: var(--font-size-100); line-height: 1.35; }

  &:disabled {
    opacity: 0.32;
    cursor: not-allowed;
  }

  &:not(:disabled):hover {
    border-color: var(--sim-route);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 3px solid var(--sim-signal);
    outline-offset: 2px;
  }
`;

const CoordinateGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
`;

const LocationEditor = styled.div`
  display: grid;
  gap: var(--space-3);
`;

const LabeledInput = styled.label`
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  > span { color: rgb(244 250 247 / 0.72); font-size: var(--font-size-100); font-weight: 600; }
  input, select, textarea {
    width: 100%;
    min-height: 46px;
    padding: var(--space-3);
    border: 1px solid rgb(204 233 223 / 0.25);
    border-radius: var(--space-1);
    background: rgb(255 255 255 / 0.06);
    color: #f4faf7;
    font: inherit;
    font-size: var(--font-size-200);
  }
  textarea { min-height: 82px; resize: vertical; }

  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 3px solid var(--sim-signal);
    outline-offset: 2px;
  }
`;

const PresetRail = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;

  > svg {
    width: 15px;
    height: 15px;
    margin-right: 2px;
    color: var(--sim-route);
  }
`;

const PresetButton = styled.button`
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid rgb(204 233 223 / 0.18);
  border-radius: 999px;
  background: transparent;
  color: rgb(244 250 247 / 0.68);
  font: inherit;
  font-size: 11px;
  cursor: pointer;

  &:hover {
    border-color: var(--sim-route);
    color: #fff;
  }
`;

const ModeNotice = styled.p`
  padding: var(--space-3);
  border-left: 3px solid var(--sim-route);
  background: rgb(57 167 142 / 0.1);
  color: rgb(244 250 247 / 0.64);
  font-size: var(--font-size-100);
`;

const CompactOptions = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
`;

const OptionalOptions = styled(CompactOptions)`
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const CompactButton = styled.button<{ $active: boolean }>`
  min-height: 44px;
  padding: var(--space-2);
  border: 1px solid ${({ $active }) => $active ? "var(--sim-route)" : "rgb(204 233 223 / 0.2)"};
  border-radius: 8px 8px 8px 2px;
  background: ${({ $active }) => $active ? "var(--sim-mint)" : "rgb(255 255 255 / 0.035)"};
  color: ${({ $active }) => $active ? "var(--sim-ink)" : "#f4faf7"};
  font: inherit;
  font-size: var(--font-size-100);
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid var(--sim-signal);
    outline-offset: 2px;
  }
`;

const RunButton = styled.button`
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 0;
  border-radius: 12px 12px 12px 3px;
  background: var(--sim-signal);
  color: var(--sim-ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 180ms ease, transform 180ms ease;
  &:disabled { opacity: 0.55; cursor: wait; }
  &:not(:disabled):active { transform: scale(0.985); }
  svg { width: 18px; height: 18px; }

  &[aria-busy="true"] svg {
    animation: simulator-spin 900ms linear infinite;
  }

  &:not(:disabled):hover {
    box-shadow: 0 10px 26px rgb(241 164 93 / 0.24);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 3px solid var(--sim-signal);
    outline-offset: 2px;
  }

  @keyframes simulator-spin {
    to { transform: rotate(360deg); }
  }
`;

const ErrorNotice = styled.p`
  padding: var(--space-3);
  border-left: 3px solid #ff8e7d;
  background: rgb(255 142 125 / 0.1);
  color: #ffc1b7;
  font-size: var(--font-size-100);
`;

const ResultArea = styled.section`
  min-width: 0;
  display: grid;
  gap: var(--space-5);
`;

const ResultAnnouncement = styled.p`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

const EmptyResult = styled.div`
  min-height: 420px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-3);
  padding: var(--space-6);
  border: 1px dashed rgb(16 47 45 / 0.3);
  border-radius: 4px 24px 24px 24px;
  background:
    radial-gradient(circle at 50% 42%, rgb(57 167 142 / 0.12), transparent 28%),
    var(--sim-paper);
  color: var(--color-text-muted);
  text-align: center;
  svg { width: 44px; height: 44px; color: var(--sim-route); }
  h2 { color: var(--color-text); font-size: var(--font-size-400); }
  p { font-size: var(--font-size-200); }
`;

const ResultHeader = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  > div:first-child { display: grid; gap: var(--space-1); }
  > div:first-child > span {
    color: var(--sim-route);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
  }
  h2 { font-size: var(--font-size-600); }
  p { color: var(--color-text-muted); font-size: var(--font-size-100); }
  @media (max-width: 640px) { align-items: flex-start; flex-direction: column; }
`;

const ScoreGuide = styled.small`
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const FeatureSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);

  span {
    padding: var(--space-2) var(--space-3);
    border: 1px solid rgb(57 167 142 / 0.28);
    border-radius: 999px;
    background: rgb(204 233 223 / 0.48);
    font-size: var(--font-size-100);
    font-weight: 600;
  }
`;

const MetricGrid = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid rgb(16 47 45 / 0.16);
  border-radius: 4px 18px 18px 18px;
  background: var(--sim-paper);

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const MetricCard = styled.div<{ $accent?: boolean }>`
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: baseline;
  gap: 5px var(--space-2);
  padding: var(--space-4);
  border-right: 1px solid rgb(16 47 45 / 0.12);
  background: ${({ $accent }) => $accent ? "var(--sim-mint)" : "transparent"};

  small {
    color: var(--sim-route);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9px;
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  strong {
    grid-column: 1 / -1;
    color: var(--sim-ink);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--font-size-600);
    font-variant-numeric: tabular-nums;
  }

  &:last-of-type {
    border-right: 0;
  }

  @media (max-width: 640px) {
    &:nth-of-type(2n) {
      border-right: 0;
    }

    &:nth-of-type(-n + 2) {
      border-bottom: 1px solid var(--color-neutral-400);
    }
  }
`;

const RankLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  > span { color: var(--color-text-muted); font-size: var(--font-size-100); }
`;

const StatusPill = styled.span<{ $selected: boolean }>`
  width: fit-content;
  padding: 4px 9px;
  border-radius: 999px;
  background: ${({ $selected }) => $selected ? "var(--sim-mint)" : "var(--color-neutral-300)"};
  color: var(--color-text) !important;
  font-size: var(--font-size-100);
  font-weight: 700;
  white-space: nowrap;
`;

const Score = styled.strong`
  flex: none;
  font-size: var(--font-size-500);
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1;
  small { margin-left: 2px; color: var(--color-text-muted); font-size: var(--font-size-100); font-weight: 500; }
`;

const CandidateComparison = styled.section`
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgb(16 47 45 / 0.16);
  border-radius: 4px 18px 18px 18px;
  background: var(--sim-paper);
`;

const CandidateComparisonHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4);
  border-bottom: 1px solid rgb(16 47 45 / 0.14);

  h3 {
    font-size: var(--font-size-300);
  }

  p,
  > span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  p {
    margin-top: 2px;
  }

  > span {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }
`;

const CandidateTableViewport = styled.div`
  overflow-x: auto;
  overscroll-behavior-x: contain;

  @media (max-width: 640px) {
    display: none;
  }
`;

const CandidateTable = styled.table`
  width: 100%;
  min-width: 840px;
  border-collapse: collapse;
  font-size: var(--font-size-100);

  caption {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  th,
  td {
    padding: var(--space-3);
    border-bottom: 1px solid var(--color-neutral-400);
    text-align: left;
    vertical-align: top;
  }

  thead th {
    position: sticky;
    z-index: 1;
    top: 0;
    background: #e3ece8;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    font-weight: 700;
    white-space: nowrap;
  }

  tbody th {
    font-weight: inherit;
  }

  tr > :nth-child(1) {
    width: 56px;
  }

  tr > :nth-child(2) {
    width: 180px;
  }

  tr > :nth-child(3) {
    width: 70px;
  }

  tr > :nth-child(4) {
    width: 80px;
  }

  tr > :nth-child(5) {
    width: 130px;
  }

  tr > :nth-child(6) {
    min-width: 200px;
  }

  tr > :nth-child(7) {
    width: 120px;
  }

  tbody tr:last-of-type > * {
    border-bottom: 0;
  }
`;

const CandidateTableRow = styled.tr<{ $selected: boolean }>`
  background: ${({ $selected }) =>
    $selected ? "rgb(204 233 223 / 0.56)" : "var(--sim-paper)"};

  td:first-of-type {
    box-shadow: ${({ $selected }) =>
      $selected
        ? "inset 3px 0 var(--sim-route)"
        : "none"};
  }

  &:hover {
    background: ${({ $selected }) =>
      $selected ? "rgb(204 233 223 / 0.7)" : "#f0f6f3"};
  }
`;

const RankCell = styled.div`
  display: grid;
  justify-items: start;
  gap: 1px;
  font-variant-numeric: tabular-nums;

  strong {
    color: var(--sim-ink);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--font-size-500);
    line-height: 1;
  }

  span,
  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const TablePlace = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);

  > div:last-of-type {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  strong {
    overflow-wrap: anywhere;
    font-size: var(--font-size-200);
  }

  span {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }
`;

const CandidateThumbnail = styled.div<{ $image: string }>`
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  border-radius: 2px 10px 10px 10px;
  background: var(--color-neutral-300) url(${({ $image }) => JSON.stringify($image)}) center / cover no-repeat;
`;

const RouteMeta = styled.div`
  display: grid;
  gap: var(--space-1);

  span {
    display: inline-flex;
    align-items: flex-start;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: 1.4;
  }

  svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    margin-top: 1px;
  }
`;

const ReasonText = styled.div`
  min-width: 0;
  display: grid;
  gap: var(--space-1);

  strong {
    font-size: var(--font-size-100);
    overflow-wrap: anywhere;
  }

  p {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
`;

const ExclusionReason = styled.p`
  margin-top: var(--space-1);
  padding-left: var(--space-2);
  border-left: 2px solid var(--color-neutral-700);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
`;

const BreakdownDetails = styled.details`
  min-width: 116px;

  summary {
    width: fit-content;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-neutral-800);
    border-radius: var(--space-1);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--font-size-100);
    font-weight: 700;
    cursor: pointer;
  }

  summary::after {
    margin-left: var(--space-2);
    content: "+";
  }

  &[open] summary::after {
    content: "−";
  }

  summary:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }

  &[open] summary {
    margin-bottom: var(--space-2);
    border-color: var(--color-brand-900);
    background: var(--color-brand-100);
  }
`;

const ScoreDefinitionList = styled.dl`
  min-width: 220px;
  display: grid;
  gap: 0;
  margin: 0;
  border-top: 1px solid var(--color-neutral-400);

  > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--color-neutral-300);
  }

  dt,
  dd {
    margin: 0;
    font-size: var(--font-size-100);
  }

  dt {
    color: var(--color-text-muted);
  }

  dd {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  dd[data-tone="bonus"] {
    color: #14846f;
  }

  dd[data-tone="penalty"] {
    color: var(--color-warning);
  }
`;

const MobileCandidateList = styled.ol`
  display: none;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (max-width: 640px) {
    display: grid;
  }
`;

const MobileCandidateRow = styled.li<{ $selected: boolean }>`
  min-width: 0;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-neutral-400);
  background: ${({ $selected }) =>
    $selected ? "rgb(204 233 223 / 0.56)" : "var(--sim-paper)"};
  box-shadow: ${({ $selected }) =>
    $selected
      ? "inset 3px 0 var(--sim-route)"
      : "none"};

  &:last-of-type {
    border-bottom: 0;
  }

  dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--space-4);
  }

  > details {
    min-width: 0;
  }
`;

const MobileCandidateHeader = styled.div`
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);

  > div {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  h4 {
    overflow-wrap: anywhere;
    font-size: var(--font-size-300);
  }

  > div > small {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  [data-mobile-score] {
    font-size: var(--font-size-600);
  }
`;

const RawDetails = styled.details`
  border: 1px solid rgb(16 47 45 / 0.16);
  border-radius: 4px 14px 14px 14px;
  background: var(--sim-paper);
  summary { padding: var(--space-4); font-size: var(--font-size-200); font-weight: 600; cursor: pointer; }
  summary:focus-visible { outline: 3px solid var(--color-brand-900); outline-offset: 2px; }
  pre { max-height: 520px; margin: 0; padding: var(--space-4); overflow: auto; border-top: 1px solid rgb(16 47 45 / 0.14); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.5; }
`;

const AccessPage = styled.main`
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--space-5);
  background: var(--color-neutral-200);
`;

const AccessLoading = styled.p`
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
`;

const AccessCard = styled.section`
  width: min(420px, 100%);
  display: grid;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--color-neutral-400);
  border-radius: var(--space-3);
  background: var(--color-surface);
  box-shadow: 0 12px 36px rgb(var(--color-black-rgb) / 0.08);

  > strong { color: var(--color-brand-900); }
  h1 { font-size: var(--font-size-600); }
  p { color: var(--color-text-muted); }
`;

const PrimaryLink = styled(Link)`
  min-height: 48px;
  display: grid;
  place-items: center;
  border-radius: var(--space-1);
  background: var(--color-secondary-800);
  color: var(--color-black);
  font-weight: 700;
  text-decoration: none;

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }
`;

const TextLink = styled(Link)`
  min-height: 44px;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  text-decoration: none;

  &:focus-visible {
    outline: 3px solid var(--color-brand-900);
    outline-offset: 2px;
  }
`;
